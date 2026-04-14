import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

type HealthResponse = {
  status: string;
  timestamp: string;
  uptime: number;
  version: string;
  database: string;
};

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Endpoint de monitoring — accessible sans authentification JWT.
  @Get('/health')
  async getHealth(): Promise<HealthResponse> {
    let databaseStatus = 'disconnected';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      databaseStatus = 'connected';
    } catch {
      // La base est inaccessible, on retourne quand même un statut partiel.
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
