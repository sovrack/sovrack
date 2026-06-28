import {
  Controller,
  Get,
  Inject,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Queue } from 'bullmq';
import { PrismaService } from './shared/database/prisma.service';
import { PlatformService } from './modules/platform/platform.service';
import { Public } from './shared/decorators/public.decorator';

type ComponentStatus = 'connected' | 'disconnected';

type HealthResponse = {
  status: string;
  timestamp: string;
  uptime: number;
  version: string;
  database: ComponentStatus;
  redis: ComponentStatus;
  webhook: {
    autoConfigure: boolean;
    configured: boolean;
    valid: boolean;
    callbackUrl: string | null;
  };
};

@ApiTags('Health')
@Public() // health/liveness/readiness probes — must be reachable without a JWT
@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformService: PlatformService,
    private readonly configService: ConfigService,
    // Optional so the controller still builds in unit tests / queue-less setups.
    @Optional() @Inject('DEPLOYMENTS_QUEUE') private readonly queue?: Queue,
  ) {}

  /**
   * Liveness probe (Kubernetes/orchestrator): the process is up and the event
   * loop responds. Intentionally dependency-free — never fails on a down DB/Redis
   * (that's readiness' job), so the orchestrator doesn't kill a recoverable pod.
   */
  @Get('health/live')
  @ApiOperation({ summary: 'Liveness probe (process up)' })
  getLiveness(): { status: 'ok'; uptime: number } {
    return { status: 'ok', uptime: process.uptime() };
  }

  /**
   * Readiness probe: the app can serve traffic only when its hard dependencies
   * (PostgreSQL + Redis/BullMQ) are reachable. Returns 503 otherwise so the
   * orchestrator stops routing traffic until they recover.
   */
  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness probe (dependencies reachable)' })
  @ApiResponse({ status: 200, description: 'Ready to serve traffic' })
  @ApiResponse({ status: 503, description: 'A hard dependency is unavailable' })
  async getReadiness(): Promise<{
    status: 'ready';
    database: ComponentStatus;
    redis: ComponentStatus;
  }> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);
    if (database !== 'connected' || redis !== 'connected') {
      throw new ServiceUnavailableException({
        status: 'not-ready',
        database,
        redis,
      });
    }
    return { status: 'ready', database, redis };
  }

  @Get('health')
  @ApiOperation({ summary: 'Platform health check' })
  @ApiResponse({ status: 200, description: 'Service operational' })
  async getHealth(): Promise<HealthResponse> {
    const webhook = await this.resolveWebhookConfigStatus();
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? '1.0.0',
      database,
      redis,
      webhook,
    };
  }

  private async checkDatabase(): Promise<ComponentStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'connected';
    } catch {
      return 'disconnected';
    }
  }

  /** Ping Redis via the BullMQ queue's shared ioredis client (deploy worker). */
  private async checkRedis(): Promise<ComponentStatus> {
    if (!this.queue) return 'disconnected';
    try {
      // BullMQ types `client` minimally; the underlying ioredis client has ping().
      const client = (await this.queue.client) as unknown as {
        ping: () => Promise<string>;
      };
      const pong = await client.ping();
      return pong === 'PONG' ? 'connected' : 'disconnected';
    } catch {
      return 'disconnected';
    }
  }

  private async resolveWebhookConfigStatus(): Promise<
    HealthResponse['webhook']
  > {
    const autoConfigure = !['0', 'false', 'no', 'off'].includes(
      this.configService
        .get<string>('GITLAB_WEBHOOK_AUTO_CONFIGURE', 'true')
        .trim()
        .toLowerCase(),
    );

    if (!autoConfigure) {
      return {
        autoConfigure: false,
        configured: false,
        valid: true,
        callbackUrl: null,
      };
    }

    const base = await this.platformService.resolveWebhookBaseUrl();
    if (!base) {
      return {
        autoConfigure: true,
        configured: false,
        valid: false,
        callbackUrl: null,
      };
    }

    try {
      const parsed = new URL(base);
      const valid = parsed.protocol === 'http:' || parsed.protocol === 'https:';
      if (!valid) {
        return {
          autoConfigure: true,
          configured: true,
          valid: false,
          callbackUrl: null,
        };
      }

      const callbackUrl = await this.platformService.buildWebhookUrl(
        'webhooks/incoming',
        { throwIfMissing: false },
      );

      return {
        autoConfigure: true,
        configured: true,
        valid: true,
        callbackUrl: callbackUrl || null,
      };
    } catch {
      return {
        autoConfigure: true,
        configured: true,
        valid: false,
        callbackUrl: null,
      };
    }
  }
}
