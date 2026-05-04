import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AutomationModule } from '../automation/automation.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { MonitoringController } from './controllers/monitoring.controller';
import { MonitoringService } from './services/monitoring.service';

@Module({
  imports: [PrismaModule, HttpModule, PlatformConfigModule, AutomationModule],
  controllers: [MonitoringController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
