import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../../../core/database/prisma.module';
import { AppJwtModule } from '../../../core/jwt/jwt.module';
import { InfrastructureModule } from '../preparation/infrastructure.module';
import { AuditModule } from '../../audit';
import {
  ServersAuditService,
  ServersDetectionService,
  ServerHostKeyService,
  ServerVerificationService,
  ServersCoreService,
  ServersCryptoService,
  ServersJobsService,
  ServersConnectionService,
} from './services';

/**
 * Shared server primitives (SSH, crypto, host-key, detection, verification,
 * jobs, audit) + the ServersCoreService lifecycle facade. Preparation/Ansible
 * now live in InfrastructureModule; we import it (forwardRef) so ServersCoreService
 * can trigger Docker-install preparation during onboarding, and we re-export the
 * primitives InfrastructureModule consumes.
 */
@Module({
  imports: [PrismaModule, AppJwtModule, forwardRef(() => InfrastructureModule), AuditModule],
  providers: [
    ServersCoreService,
    ServersCryptoService,
    ServerHostKeyService,
    ServersConnectionService,
    ServersJobsService,
    ServerVerificationService,
    ServersDetectionService,
    ServersAuditService,
  ],
  exports: [
    ServersCoreService,
    ServersCryptoService,
    ServerHostKeyService,
    ServersConnectionService,
    ServersJobsService,
    ServerVerificationService,
    ServersDetectionService,
    ServersAuditService,
  ],
})
export class ServersSharedModule {}
