import { Module } from '@nestjs/common';
import { AppJwtModule } from '../../../core/jwt/jwt.module';
import { InfrastructureCoreModule } from '../core/infrastructure-core.module';
import { ServerPreparationController } from './controllers/server-preparation.controller';
import { ServerPreparationsController } from './controllers/server-preparations.controller';
import { ServerPreparationOptionsController } from './controllers/server-preparation-options.controller';
import { ServerPreparationService } from './services/infra-preparation.service';
import { ServerPreparationAnsibleService } from './services/server-preparation-ansible.service';
import { ServerPreparationStateService } from './services/preparation/server-preparation-state.service';
import { ServerPreparationGateway } from './gateways/server-preparation.gateway';

/**
 * Infrastructure module — owns Ansible-based server PREPARATION (profiles,
 * roles, preparation runs + history + live logs). Split out of servers/ so
 * that servers/ stays focused on VPS lifecycle (SSH verify + Docker install).
 *
 * Consumes the shared server primitives from InfrastructureCoreModule (a leaf
 * module). It no longer imports ServersSharedModule, so the previous two-way
 * `forwardRef` cycle is gone.
 */
@Module({
  imports: [AppJwtModule, InfrastructureCoreModule],
  controllers: [
    ServerPreparationController,
    ServerPreparationsController,
    ServerPreparationOptionsController,
  ],
  providers: [
    ServerPreparationService,
    ServerPreparationAnsibleService,
    ServerPreparationStateService,
    ServerPreparationGateway,
  ],
  exports: [ServerPreparationService, ServerPreparationAnsibleService],
})
export class InfrastructureModule {}
