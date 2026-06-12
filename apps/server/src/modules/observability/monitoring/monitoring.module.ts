import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../core/database/prisma.module';
import { AutomationModule } from '../../automation';
import { PlatformModule } from '../../platform';
import { ServersModule, ContainersModule } from '../../infrastructure';
import { MonitoringController } from './controllers/monitoring.controller';
import { MonitoringService } from './services/monitoring.service';
import { MonitoringStatsService } from './services/monitoring-stats.service';
import { MonitoringPrometheusService } from './services/monitoring-prometheus.service';

@Module({
  imports: [PrismaModule, HttpModule, PlatformModule, AutomationModule, ServersModule, ContainersModule],
  controllers: [MonitoringController],
  providers: [
    MonitoringService,
    MonitoringStatsService,
    MonitoringPrometheusService,
  ],
  exports: [
    MonitoringService,
    MonitoringStatsService,
    MonitoringPrometheusService,
  ],
})
export class MonitoringModule {}
