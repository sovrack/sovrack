import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma/prisma.service';

type HealthResponse = {
  status: string;
  timestamp: string;
  uptime: number;
  version: string;
  database: string;
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
    };
  }
}
