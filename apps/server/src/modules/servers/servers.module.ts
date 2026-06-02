import { Module } from '@nestjs/common';
import {
  ServerAuditModule,
  ServerDetectionModule,
  ServerLegacyModule,
  ServerManagementModule,
  ServerPreparationModule,
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
    ServerPreparationModule,
    ServerAuditModule,
    ServerLegacyModule,
  ],
  exports: [ServersSharedModule],
})
export class ServersModule {}
