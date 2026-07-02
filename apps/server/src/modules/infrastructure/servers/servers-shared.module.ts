import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { AppJwtModule } from '../../../shared/jwt/jwt.module';
import { InfrastructureModule } from '../preparation/infrastructure.module';
import { InfrastructureCoreModule } from '../core/infrastructure-core.module';
import { AuditModule } from '../../audit';
import { ServersCoreService } from './services';
import { ServersCrudService } from './services/servers-crud.service';
import { ServersJobsFacade } from './services/servers-jobs.facade';
import { ServersReadersFacade } from './services/servers-readers.facade';

/**
 * Server lifecycle facade (ServersCoreService). The shared primitives (SSH,
 * crypto, host-key, detection, verification, jobs, audit) now live in
 * InfrastructureCoreModule, which we import AND re-export so external consumers
 * keep receiving them. We import InfrastructureModule (no more forwardRef — the
 * cycle is gone) so ServersCoreService can trigger Docker-install preparation
 * during onboarding.
 */
@Module({
  imports: [
    PrismaModule,
    AppJwtModule,
    InfrastructureCoreModule,
    InfrastructureModule,
    AuditModule,
  ],
  providers: [
    ServersJobsFacade,
    ServersReadersFacade,
    ServersCrudService,
    ServersCoreService,
  ],
  exports: [ServersCoreService, InfrastructureCoreModule],
})
export class ServersSharedModule {}
