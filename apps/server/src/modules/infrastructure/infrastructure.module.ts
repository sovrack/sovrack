import { forwardRef, Module } from '@nestjs/common';
import { AppJwtModule } from '../../core/jwt/jwt.module';
import { ServersSharedModule } from '../servers/servers-shared.module';
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
 * Consumes shared server primitives (SSH, crypto, host-key, detection,
 * verification, jobs, audit) from ServersSharedModule; exports the preparation
 * + ansible services back so servers-core can trigger Docker-install during
 * onboarding (forwardRef bridges the two-way collaboration).
 */
@Module({
  imports: [AppJwtModule, forwardRef(() => ServersSharedModule)],
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
