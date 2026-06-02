import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './core/database/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  @ApiOperation({ summary: 'Vérification de santé de la plateforme' })
  @ApiResponse({ status: 200, description: 'Service opérationnel' })
  async getHealth(): Promise<HealthResponse> {
    let databaseStatus = 'disconnected';
    const webhook = this.resolveWebhookConfigStatus();

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

  private resolveWebhookConfigStatus(): HealthResponse['webhook'] {
    const autoConfigure = !['0', 'false', 'no', 'off'].includes(
      process.env.GITLAB_WEBHOOK_AUTO_CONFIGURE?.trim().toLowerCase() ?? '',
    );

    if (!autoConfigure) {
      return {
        autoConfigure: false,
        configured: false,
        valid: true,
        callbackUrl: null,
      };
    }

    const raw = process.env.WEBHOOK_URL?.trim();
    if (!raw) {
      return {
        autoConfigure: true,
        configured: false,
        valid: false,
        callbackUrl: null,
      };
    }

    try {
      const parsed = new URL(raw);
      const valid = parsed.protocol === 'http:' || parsed.protocol === 'https:';
      if (!valid) {
        return {
          autoConfigure: true,
          configured: true,
          valid: false,
          callbackUrl: null,
        };
      }

      parsed.search = '';
      parsed.hash = '';
      const path = parsed.pathname.replace(/\/+$/, '');
      const normalizedBase = `${parsed.origin}${path}`;
      const callbackUrl = path.toLowerCase().endsWith('/gitlab/webhook')
        ? normalizedBase
        : `${normalizedBase}/gitlab/webhook`;

      return {
        autoConfigure: true,
        configured: true,
        valid: true,
        callbackUrl,
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
