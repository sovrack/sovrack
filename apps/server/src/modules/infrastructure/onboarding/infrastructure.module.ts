import { Module } from '@nestjs/common';
import { AppJwtModule } from '../../../shared/jwt/jwt.module';
import { InfrastructureCoreModule } from '../core/infrastructure-core.module';
import { ServerRunsModule } from '../server-runs/server-runs.module';
import { ServerSetupController } from './controllers/server-setup.controller';
import { ServerSetupsController } from './controllers/server-setups.controller';
import { ServerSetupOptionsController } from './controllers/server-setup-options.controller';
import { ServerSetupService } from './services/infra-setup.service';
import { ServerSetupAnsibleService } from './services/server-setup-ansible.service';
import { ServerSetupStateService } from './services/setup/server-setup-state.service';
import { InfraSetupRunnerService } from './services/infra-setup-runner.service';
import { SetupPostProcessorService } from './services/setup-post-processor.service';
import { SetupAbortBridge } from './services/setup-abort.bridge';
import { SetupProcessor } from './processors/setup.processor';
import { ServerSetupGateway } from './gateways/server-setup.gateway';

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
  imports: [AppJwtModule, InfrastructureCoreModule, ServerRunsModule],
  controllers: [
    ServerSetupController,
    ServerSetupsController,
    ServerSetupOptionsController,
  ],
  providers: [
    ServerSetupAnsibleService,
    ServerSetupStateService,
    ServerSetupGateway,
    InfraSetupRunnerService,
    SetupPostProcessorService,
    SetupAbortBridge,
    SetupProcessor,
    ServerSetupService,
  ],
  exports: [ServerSetupService, ServerSetupAnsibleService],
})
export class InfrastructureModule {}
