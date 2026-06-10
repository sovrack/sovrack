import { Module } from '@nestjs/common';
import {
  ServerAuditModule,
  ServerDetectionModule,
  ServerManagementModule,
  ServerValidationModule,
} from './modules';
import { ServersSharedModule } from './servers-shared.module';
import { AppJwtModule } from '../../core/jwt/jwt.module';

@Module({
  imports: [
    AppJwtModule,
    ServersSharedModule,
    ServerManagementModule,
    ServerValidationModule,
    ServerDetectionModule,
    ServerAuditModule,
  ],
  // P5-#2: re-export ServerManagementModule so DeploymentsModule
  // (which imports ServersModule) can resolve DockerRemoteService.
  exports: [ServersSharedModule, ServerManagementModule],
})
export class ServersModule {}
