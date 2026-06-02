import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { ServerPreparationGateway } from './server-preparation.gateway';
import {
  AnsibleExecutionService,
  ServerAuditService,
  ServerDetectionService,
  ServerHostKeyService,
  ServerLegacyApiService,
  ServerPreparationService,
  ServerVerificationService,
  ServersCoreService,
  ServersCryptoService,
  ServersJobsService,
  ServersSshService,
} from './services';
import { ServerPreparationStateService } from './services/preparation/server-preparation-state.service';
import { AppJwtModule } from '../../core/jwt/jwt.module';

@Module({
  imports: [
    PrismaModule,
    AppJwtModule,
  ],
  providers: [
    ServersCoreService,
    ServersCryptoService,
    ServerHostKeyService,
    ServersSshService,
    AnsibleExecutionService,
    ServersJobsService,
    ServerVerificationService,
    ServerDetectionService,
    ServerPreparationService,
    ServerPreparationStateService,
    ServerAuditService,
    ServerLegacyApiService,
    ServerPreparationGateway,
  ],
  exports: [
    ServersCoreService,
    ServersCryptoService,
    ServerHostKeyService,
    ServersSshService,
    ServerPreparationGateway,
  ],
})
export class ServersSharedModule {}
