import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { AutomationGateway } from './automation.gateway';
import { AutomationController } from './controllers/automation.controller';
import { AutomationRunnerService } from './services/automation-runner.service';
import { AutomationService } from './services/automation.service';
import { AppJwtModule } from '../../core/jwt/jwt.module';

@Module({
  imports: [
    PrismaModule,
    InfrastructureModule,
    AppJwtModule,
  ],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationRunnerService, AutomationGateway],
  exports: [AutomationService],
})
export class AutomationModule {}
