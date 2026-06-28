import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { AppJwtModule } from '../../../shared/jwt/jwt.module';
import { AuditModule } from '../../audit';
import {
  ServersAuditService,
  ServersDetectionService,
  ServerVerificationService,
  ServersJobsService,
  ServersConnectionService,
} from '../servers/services';

/**
 * Leaf module holding the SHARED server primitives (SSH connection, detection,
 * verification, jobs, audit) that BOTH the servers lifecycle
 * (ServersSharedModule) and the Ansible preparation (InfrastructureModule)
 * depend on. (Host-key pinning AND SSH-credential crypto now live in the global
 * core SshModule, as they are pure SSH primitives used across modules.)
 *
 * Extracting them here breaks the previous ServersSharedModule ↔ InfrastructureModule
 * `forwardRef` cycle: this module imports neither of them, and both import this one.
 */
@Module({
  imports: [PrismaModule, AppJwtModule, AuditModule],
  providers: [
    ServersConnectionService,
    ServersJobsService,
    ServerVerificationService,
    ServersDetectionService,
    ServersAuditService,
  ],
  exports: [
    ServersConnectionService,
    ServersJobsService,
    ServerVerificationService,
    ServersDetectionService,
    ServersAuditService,
  ],
})
export class InfrastructureCoreModule {}
