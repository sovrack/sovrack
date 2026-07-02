import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { AutomationModule } from '../../automation';
import { PlatformModule } from '../../platform';
import { ServersModule, ContainersModule } from '../../infrastructure';
import { MonitoringController } from './controllers/monitoring.controller';
import { RuntimeLogsController } from './controllers/runtime-logs.controller';
import { MonitoringService } from './services/monitoring.service';
import { MonitoringStatsService } from './services/monitoring-stats.service';
import { MonitoringPrometheusService } from './services/monitoring-prometheus.service';
import { MonitoringLokiService } from './services/monitoring-loki.service';
import { MonitoringAlertsService } from './services/monitoring-alerts.service';
import { MonitoringRuntimeLogsService } from './services/monitoring-runtime-logs.service';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    PlatformModule,
    AutomationModule,
    ServersModule,
    ContainersModule,
  ],
  controllers: [MonitoringController, RuntimeLogsController],
  providers: [
    MonitoringService,
    MonitoringStatsService,
    MonitoringPrometheusService,
    MonitoringLokiService,
    MonitoringAlertsService,
    MonitoringRuntimeLogsService,
  ],
  exports: [
    MonitoringService,
    MonitoringStatsService,
    MonitoringPrometheusService,
    MonitoringLokiService,
  ],
})
export class MonitoringModule {}
