import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../core/database/prisma.module';
import { AppJwtModule } from '../../../core/jwt/jwt.module';
import { AuditModule } from '../../audit';
import {
  ServersAuditService,
  ServersDetectionService,
  ServerHostKeyService,
  ServerVerificationService,
  ServersCryptoService,
  ServersJobsService,
  ServersConnectionService,
} from '../servers/services';

/**
 * Leaf module holding the SHARED server primitives (SSH connection, crypto,
 * host-key, detection, verification, jobs, audit) that BOTH the servers
 * lifecycle (ServersSharedModule) and the Ansible preparation
 * (InfrastructureModule) depend on.
 *
 * Extracting them here breaks the previous ServersSharedModule ↔ InfrastructureModule
 * `forwardRef` cycle: this module imports neither of them, and both import this one.
 */
@Module({
  imports: [PrismaModule, AppJwtModule, AuditModule],
  providers: [
    ServersCryptoService,
    ServerHostKeyService,
    ServersConnectionService,
    ServersJobsService,
    ServerVerificationService,
    ServersDetectionService,
    ServersAuditService,
  ],
  exports: [
    ServersCryptoService,
    ServerHostKeyService,
    ServersConnectionService,
    ServersJobsService,
    ServerVerificationService,
    ServersDetectionService,
    ServersAuditService,
  ],
})
export class InfrastructureCoreModule {}
