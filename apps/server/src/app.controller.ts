import {
  Controller,
  Get,
  Inject,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Queue } from 'bullmq';
import { statfs } from 'node:fs/promises';
import * as os from 'node:os';
import { PrismaService } from './shared/database/prisma.service';
import { PlatformService } from './modules/platform/platform.service';
import { Public } from './shared/decorators/public.decorator';

type ComponentStatus = 'connected' | 'disconnected';

// C2 (plan produit final) : ressources de la machine qui HÉBERGE platform —
// le disque qui se remplit (images Docker, logs) est la panne silencieuse
// n°1 : Postgres s'arrête sans aucun signal préalable dans System Status.
type HostResources = {
  cpuLoad1m: number;
  cpuCount: number;
  memoryTotalMb: number;
  memoryFreeMb: number;
  memoryUsedPercent: number;
  diskTotalGb: number | null;
  diskFreeGb: number | null;
  diskUsedPercent: number | null;
};

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
  host: HostResources;
};

@ApiTags('Health')
@Public() // health/liveness/readiness probes — must be reachable without a JWT
// The global ThrottlerGuard's Redis-backed storage (ThrottlerStorageRedisService)
// itself calls Redis on every request; when Redis is down, ioredis' default
// retry/backoff made that call — and therefore this whole controller,
// including the "is Redis down?" probe itself — hang for a long time instead
// of failing fast (AUDIT_VERIFICATION_UI.md Point 1, found while verifying the
// Task 3 fix). Health/readiness probes must never depend on the very
// dependency they're reporting on, so they're exempted from rate limiting.
@SkipThrottle()
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
    queue: {
      waiting: number;
      active: number;
      failed: number;
      status: ComponentStatus;
    };
  }> {
    const [database, redis, queueStatus] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkQueueStatus(),
    ]);
    if (
      database !== 'connected' ||
      redis !== 'connected' ||
      queueStatus.status !== 'connected'
    ) {
      throw new ServiceUnavailableException({
        status: 'not-ready',
        database,
        redis,
        queue: queueStatus,
      });
    }
    return { status: 'ready', database, redis, queue: queueStatus };
  }

  @Get('health')
  @ApiOperation({ summary: 'Platform health check' })
  @ApiResponse({ status: 200, description: 'Service operational' })
  async getHealth(): Promise<HealthResponse> {
    const webhook = await this.resolveWebhookConfigStatus();
    const [database, redis, host] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.readHostResources(),
    ]);

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? '1.0.0',
      database,
      redis,
      webhook,
      host,
    };
  }

  /** CPU/RAM/disque de la machine hôte (best-effort : disque null si statfs échoue). */
  private async readHostResources(): Promise<HostResources> {
    const memTotal = os.totalmem();
    const memFree = os.freemem();
    let diskTotalGb: number | null = null;
    let diskFreeGb: number | null = null;
    let diskUsedPercent: number | null = null;
    try {
      const fs = await this.withTimeout(statfs('/'), 2000);
      const total = fs.blocks * fs.bsize;
      const free = fs.bavail * fs.bsize;
      diskTotalGb = Math.round((total / 1024 ** 3) * 10) / 10;
      diskFreeGb = Math.round((free / 1024 ** 3) * 10) / 10;
      diskUsedPercent =
        total > 0 ? Math.round(((total - free) / total) * 100) : null;
    } catch {
      // conteneur/OS sans statfs — le reste de /health reste utilisable
    }
    return {
      cpuLoad1m: Math.round(os.loadavg()[0] * 100) / 100,
      cpuCount: os.cpus().length,
      memoryTotalMb: Math.round(memTotal / 1024 / 1024),
      memoryFreeMb: Math.round(memFree / 1024 / 1024),
      memoryUsedPercent: Math.round(((memTotal - memFree) / memTotal) * 100),
      diskTotalGb,
      diskFreeGb,
      diskUsedPercent,
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

  // Bounds any health-check probe against Redis: when Redis is actually down,
  // ioredis' default retryStrategy keeps retrying forever instead of
  // rejecting, so an un-bounded await here would hang the request until an
  // unrelated upstream timeout kills it with a generic 500 — not the clean
  // "disconnected" status a health check must always return promptly
  // (AUDIT_VERIFICATION_UI.md Point 1, found while verifying the Task 3 fix).
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err: unknown) => {
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    });
  }

  /** Ping Redis via the BullMQ queue's shared ioredis client (deploy worker). */
  private async checkRedis(): Promise<ComponentStatus> {
    if (!this.queue) return 'disconnected';
    try {
      // BullMQ types `client` minimally; the underlying ioredis client has ping().
      const client = (await this.withTimeout(
        this.queue.client,
        2000,
      )) as unknown as {
        ping: () => Promise<string>;
      };
      const pong = await this.withTimeout(client.ping(), 2000);
      return pong === 'PONG' ? 'connected' : 'disconnected';
    } catch {
      return 'disconnected';
    }
  }

  /** Check BullMQ queue status and health */
  private async checkQueueStatus(): Promise<{
    waiting: number;
    active: number;
    failed: number;
    status: ComponentStatus;
  }> {
    if (!this.queue) {
      return { waiting: 0, active: 0, failed: 0, status: 'disconnected' };
    }
    try {
      const [waiting, active, failed] = await this.withTimeout(
        Promise.all([
          this.queue.getWaitingCount(),
          this.queue.getActiveCount(),
          this.queue.getFailedCount(),
        ]),
        2000,
      );
      return {
        waiting,
        active,
        failed,
        status: 'connected',
      };
    } catch {
      return { waiting: 0, active: 0, failed: 0, status: 'disconnected' };
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
