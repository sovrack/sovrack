import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { BuildModule } from '../build';
import { SourceProvidersModule } from '../source-providers';
import { NotificationsModule } from '../notifications';
import { PrismaModule } from '../../shared/database/prisma.module';
import { AuditModule } from '../audit';
import { ServersModule } from '../infrastructure';
import { DockerDeployExecutorService } from './core/docker-deploy-executor.service';
import { ImageResolverService } from './core/image-resolver.service';
import { DeploymentLogEmitter } from './core/deployment-log-emitter.service';
import { DeploymentEnvService } from './core/deployment-env.service';
import { DeploymentPrelaunchService } from './core/deployment-prelaunch.service';
import { LocalBuildService } from './core/local-build.service';
import { TraefikRouteService } from './core/traefik-route.service';
import { DeployRoutingService } from './core/deploy-routing.service';
import { ContainerLifecycleService } from './core/container-lifecycle.service';
import { RegistryAuthService } from './core/registry-auth.service';
import { DeploymentsAuthorizationService } from './query/deployments-authorization.service';
import { DeploymentsHealthcheckService } from './health/deployments-healthcheck.service';
import { DeploymentsController } from './deployments.controller';
import { DeploymentsGateway } from './gateways/deployments.gateway';
import { DeploymentEventsPublisher } from './events/deployment-events.publisher';
import { DeploymentsQueryService } from './query/deployments-query.service';
import { AppJwtModule } from '../../shared/jwt/jwt.module';
import { DeploymentsCreateService } from './core/deployments-create.service';
import { DeploymentsLifecycleService } from './core/deployments-lifecycle.service';
import { DeploymentsRollbackService } from './core/deployments-rollback.service';
import { DeploymentsPipelineHandlerService } from './triggers/deployments-pipeline-handler.service';
import { DeploymentsAutoTriggerService } from './triggers/deployments-auto-trigger.service';
import { DeploymentsLogStreamService } from './query/deployments-log-stream.service';
import { DeploymentContainerInspectorService } from './query/deployment-container-inspector.service';
import { DeploymentsStaleRecoveryService } from './health/deployments-stale-recovery.service';
import { ReconcilerService } from './health/reconciler.service';
import { DeploymentsValidationService } from './query/deployments-validation.service';
import { DeploymentsLogSearchService } from './query/deployments-log-search.service';
import { DeploymentsConfigResolver } from './query/deployments-config-resolver.service';
import { DeploymentsProcessor } from './processors/deployments.processor';
import { PipelineRunsCleanupService } from './health/pipeline-runs-cleanup.service';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    SourceProvidersModule,
    BuildModule,
    ServersModule,
    NotificationsModule,
    ConfigModule,
    AppJwtModule,
    AuditModule,
  ],
  controllers: [DeploymentsController],
  providers: [
    DeploymentsCreateService,
    DeploymentsLifecycleService,
    DeploymentsRollbackService,
    DeploymentsPipelineHandlerService,
    DeploymentsAutoTriggerService,
    DeploymentsQueryService,
    DeploymentsGateway,
    DeploymentEventsPublisher,
    DockerDeployExecutorService,
    ImageResolverService,
    DeploymentLogEmitter,
    DeploymentEnvService,
    DeploymentPrelaunchService,
    LocalBuildService,
    TraefikRouteService,
    DeployRoutingService,
    ContainerLifecycleService,
    RegistryAuthService,
    DeploymentsAuthorizationService,
    DeploymentsHealthcheckService,
    DeploymentsLogStreamService,
    DeploymentContainerInspectorService,
    DeploymentsStaleRecoveryService,
    ReconcilerService,
    DeploymentsValidationService,
    DeploymentsLogSearchService,
    DeploymentsConfigResolver,
    DeploymentsProcessor,
    PipelineRunsCleanupService,
  ],
  exports: [DeploymentsQueryService, DeploymentsAuthorizationService],
})
export class DeploymentsModule {}
