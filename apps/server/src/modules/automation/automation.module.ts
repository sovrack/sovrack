import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { ServersSharedModule } from '../servers/servers-shared.module';
import { AutomationGateway } from './automation.gateway';
import { AutomationController } from './controllers/automation.controller';
import { AutomationRunnerService } from './services/automation-runner.service';
import { AutomationService } from './services/automation.service';
import { AppJwtModule } from '../../core/jwt/jwt.module';

@Module({
  imports: [
    PrismaModule,
    ServersSharedModule,
    AppJwtModule,
  ],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationRunnerService, AutomationGateway],
  exports: [AutomationService],
})
export class AutomationModule {}
