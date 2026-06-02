import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { AutomationModule } from '../automation/automation.module';
import { PlatformModule } from '../platform/platform.module';
import { ServersModule } from '../servers/servers.module';
import { MonitoringController } from './controllers/monitoring.controller';
import { MonitoringService } from './services/monitoring.service';
import { ContainerMonitoringService } from './services/container-monitoring.service';
import { MonitoringStatsService } from './services/monitoring-stats.service';
import { MonitoringPrometheusService } from './services/monitoring-prometheus.service';

@Module({
  imports: [PrismaModule, HttpModule, PlatformModule, AutomationModule, ServersModule],
  controllers: [MonitoringController],
  providers: [
    MonitoringService,
    MonitoringStatsService,
    MonitoringPrometheusService,
    ContainerMonitoringService,
  ],
  exports: [
    MonitoringService,
    MonitoringStatsService,
    MonitoringPrometheusService,
    ContainerMonitoringService,
  ],
})
export class MonitoringModule {}
