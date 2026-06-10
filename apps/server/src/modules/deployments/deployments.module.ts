import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { BuildModule } from '../build/build.module';
import { ConfigsModule } from '../configs/configs.module';
import { GitProvidersModule } from '../git-providers/git-providers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../../core/database/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ServersModule } from '../servers/servers.module';
import { DeploymentsExecutorService } from './services/deployments-executor.service';
import { DeploymentsAuthorizationService } from './services/deployments-authorization.service';
import { DeploymentsHealthcheckService } from './services/deployments-healthcheck.service';
import { DeploymentsController } from './deployments.controller';
import { DeploymentsGateway } from './gateways/deployments.gateway';
import { DeploymentsService } from './deployments.service';
import { DeploymentsQueryService } from './services/deployments-query.service';
import { AppJwtModule } from '../../core/jwt/jwt.module';
import { DeploymentsCreateService } from './services/deployments-create.service';
import { DeploymentsLifecycleService } from './services/deployments-lifecycle.service';
import { DeploymentsRollbackService } from './services/deployments-rollback.service';
import { DeploymentsPipelineHandlerService } from './services/deployments-pipeline-handler.service';
import { DeploymentsAutoTriggerService } from './services/deployments-auto-trigger.service';
import { DeploymentsLogStreamService } from './services/deployments-log-stream.service';
import { DeploymentEnvResolverService } from './services/deployment-env-resolver.service';
import { DeploymentContainerInspectorService } from './services/deployment-container-inspector.service';
import { DeploymentsStaleRecoveryService } from './services/deployments-stale-recovery.service';
import { DeploymentsValidationService } from './services/deployments-validation.service';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    GitProvidersModule,
    BuildModule,
    ConfigsModule,
    ServersModule,
    NotificationsModule,
    ConfigModule,
    AppJwtModule,
    AuditModule,
  ],
  controllers: [DeploymentsController],
  providers: [
    DeploymentsService,
    DeploymentsCreateService,
    DeploymentsLifecycleService,
    DeploymentsRollbackService,
    DeploymentsPipelineHandlerService,
    DeploymentsAutoTriggerService,
    DeploymentsQueryService,
    DeploymentsGateway,
    DeploymentsExecutorService,
    DeploymentsAuthorizationService,
    DeploymentsHealthcheckService,
    DeploymentsLogStreamService,
    DeploymentEnvResolverService,
    DeploymentContainerInspectorService,
    DeploymentsStaleRecoveryService,
    DeploymentsValidationService,
  ],
  exports: [
    DeploymentsService,
    DeploymentsQueryService,
    DeploymentsExecutorService,
    DeploymentsAuthorizationService,
  ],
})
export class DeploymentsModule {}
