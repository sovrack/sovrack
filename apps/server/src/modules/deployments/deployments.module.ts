import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { BuildModule } from '../build';
import { SourceProvidersModule } from '../source-providers';
import { NotificationsModule } from '../notifications';
import { PrismaModule } from '../../shared/database/prisma.module';
import { AuditModule } from '../audit';
import { ServersModule } from '../infrastructure';
import { ProjectAccessModule } from '../catalog/authorization/project-access.module';
import {
  DockerDeployExecutorService,
  ReplicaLauncherService,
  DeployFailureRecoveryService,
  ImageResolverService,
  DeploymentLogEmitter,
  DeploymentEnvService,
  DeploymentPrelaunchService,
  LocalBuildService,
  TraefikRouteService,
  DeployRoutingService,
  ContainerLifecycleService,
  RegistryAuthService,
  DeploymentsCreateService,
  DeploymentPreflightService,
  DeploymentsLifecycleService,
  DeploymentsRollbackService,
} from './core';
import {
  DeploymentsAuthorizationService,
  DeploymentsQueryService,
  DeploymentsLogStreamService,
  DeploymentContainerInspectorService,
  DeploymentsValidationService,
  DeploymentsLogSearchService,
  DeploymentsConfigResolver,
} from './query';
import {
  DeploymentsHealthcheckService,
  DeploymentsStaleRecoveryService,
  ReconcilerService,
  PipelineRunsCleanupService,
} from './health';
import {
  DeploymentsPipelineHandlerService,
  DeploymentsAutoTriggerService,
} from './triggers';
import { DeploymentsController } from './deployments.controller';
import { DeploymentsGateway } from './gateways/deployments.gateway';
import { DeploymentEventsPublisher } from './events/deployment-events.publisher';
import { DeploymentsProcessor } from './processors/deployments.processor';
import { AppJwtModule } from '../../shared/jwt/jwt.module';

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
    ProjectAccessModule,
  ],
  controllers: [DeploymentsController],
  providers: [
    DeploymentsCreateService,
    DeploymentPreflightService,
    DeploymentsLifecycleService,
    DeploymentsRollbackService,
    DeploymentsPipelineHandlerService,
    DeploymentsAutoTriggerService,
    DeploymentsQueryService,
    DeploymentsGateway,
    DeploymentEventsPublisher,
    DockerDeployExecutorService,
    ReplicaLauncherService,
    DeployFailureRecoveryService,
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
