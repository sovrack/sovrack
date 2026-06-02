import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { BuildModule } from '../build/build.module';
import { ConfigsModule } from '../projects/app-configs/configs.module';
import { GitlabModule } from '../git-providers/gitlab/gitlab.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../../core/database/prisma.module';
import { ServersModule } from '../servers/servers.module';
import { DeploymentsAnsibleService } from './services/deployments-ansible.service';
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
import { DeploymentsAutoService } from './services/deployments-auto.service';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    GitlabModule,
    BuildModule,
    ConfigsModule,
    ServersModule,
    NotificationsModule,
    ConfigModule,
    AppJwtModule,
  ],
  controllers: [DeploymentsController],
  providers: [
    DeploymentsService,
    DeploymentsCreateService,
    DeploymentsLifecycleService,
    DeploymentsRollbackService,
    DeploymentsAutoService,
    DeploymentsQueryService,
    DeploymentsGateway,
    DeploymentsAnsibleService,
    DeploymentsAuthorizationService,
    DeploymentsHealthcheckService,
  ],
  exports: [
    DeploymentsService,
    DeploymentsQueryService,
    DeploymentsAnsibleService,
    DeploymentsAuthorizationService,
  ],
})
export class DeploymentsModule {}
