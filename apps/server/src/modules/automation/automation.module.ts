import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { InfrastructureModule } from '../infrastructure';
import { ServerRunsModule } from '../infrastructure/server-runs/server-runs.module';
import { AutomationGateway } from './automation.gateway';
import { AutomationController } from './controllers/automation.controller';
import { AutomationRunnerService } from './services/automation-runner.service';
import { AutomationService } from './services/automation.service';
import { AppJwtModule } from '../../shared/jwt/jwt.module';

@Module({
  imports: [PrismaModule, InfrastructureModule, ServerRunsModule, AppJwtModule],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationRunnerService, AutomationGateway],
  exports: [AutomationService],
})
export class AutomationModule {}
