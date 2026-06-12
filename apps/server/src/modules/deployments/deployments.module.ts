import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { BuildModule } from '../build';
import { SourceProvidersModule } from '../source-providers';
import { NotificationsModule } from '../notifications';
import { PrismaModule } from '../../core/database/prisma.module';
import { AuditModule } from '../audit';
import { ServersModule } from '../infrastructure';
import { DockerDeployExecutorService } from './services/docker-deploy-executor.service';
import { DeploymentsAuthorizationService } from './services/deployments-authorization.service';
import { DeploymentsHealthcheckService } from './services/deployments-healthcheck.service';
import { DeploymentsController } from './deployments.controller';
import { DeploymentsGateway } from './gateways/deployments.gateway';
import { DeploymentsQueryService } from './services/deployments-query.service';
import { AppJwtModule } from '../../core/jwt/jwt.module';
import { DeploymentsCreateService } from './services/deployments-create.service';
import { DeploymentsLifecycleService } from './services/deployments-lifecycle.service';
import { DeploymentsRollbackService } from './services/deployments-rollback.service';
import { DeploymentsPipelineHandlerService } from './services/deployments-pipeline-handler.service';
import { DeploymentsAutoTriggerService } from './services/deployments-auto-trigger.service';
import { DeploymentsLogStreamService } from './services/deployments-log-stream.service';
import { DeploymentContainerInspectorService } from './services/deployment-container-inspector.service';
import { DeploymentsStaleRecoveryService } from './services/deployments-stale-recovery.service';
import { DeploymentsValidationService } from './services/deployments-validation.service';
import { DeploymentsConfigResolver } from './services/deployments-config-resolver.service';
import { DeploymentsProcessor } from './processors/deployments.processor';

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
    DockerDeployExecutorService,
    DeploymentsAuthorizationService,
    DeploymentsHealthcheckService,
    DeploymentsLogStreamService,
    DeploymentContainerInspectorService,
    DeploymentsStaleRecoveryService,
    DeploymentsValidationService,
    DeploymentsConfigResolver,
    DeploymentsProcessor,
  ],
  exports: [
    DeploymentsQueryService,
    DockerDeployExecutorService,
    DeploymentsAuthorizationService,
  ],
})
export class DeploymentsModule {}
