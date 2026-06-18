import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './core/database/prisma.service';
import { PlatformService } from './modules/platform/platform.service';

type HealthResponse = {
  status: string;
  timestamp: string;
  uptime: number;
  version: string;
  database: string;
  webhook: {
    autoConfigure: boolean;
    configured: boolean;
    valid: boolean;
    callbackUrl: string | null;
  };
};

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformService: PlatformService,
    private readonly configService: ConfigService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Vérification de santé de la plateforme' })
  @ApiResponse({ status: 200, description: 'Service opérationnel' })
  async getHealth(): Promise<HealthResponse> {
    let databaseStatus = 'disconnected';
    const webhook = await this.resolveWebhookConfigStatus();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      databaseStatus = 'connected';
    } catch {
      // Base inaccessible — retourne statut partiel.
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? '1.0.0',
      database: databaseStatus,
      webhook,
    };
  }

  private async resolveWebhookConfigStatus(): Promise<HealthResponse['webhook']> {
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
        'gitlab/webhook',
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
