import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../../shared/database/prisma.module';
import { CryptoModule } from '../../../../shared/crypto/crypto.module';
import { GitProviderConfigModule } from '../../shared/connection/git-provider-config.module';
import { GitlabClient } from './gitlab.client';
import { GitlabCiService } from './gitlab-ci.service';
import { GitlabController } from './gitlab.controller';
import { GitlabAuthorizationService } from './gitlab-authorization.service';
import { GitlabConnectionService } from './gitlab-connection.service';
import { GitlabAdapter } from './gitlab.adapter';
import { GitlabProjectConfigService } from './gitlab-project-config.service';
import { GitlabCredentialService } from './gitlab-credential.service';
import { GitlabFileService } from './gitlab-file.service';
import { GitlabWebhookConfiguratorService } from './gitlab-webhook-configurator.service';
import { GitlabOAuthController } from './gitlab-oauth.controller';
import { GitlabOnboardingService } from './gitlab-onboarding.service';
import { GitlabImageRefService } from './gitlab-image-ref.service';
import { GitlabPipelinePersistenceService } from './gitlab-pipeline-persistence.service';
import { GitlabWebhookHandler } from './gitlab-webhook.handler';
import { WorkspaceAuthorizationModule } from '../../../iam/authorization/workspace-authorization.module';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    CryptoModule,
    GitProviderConfigModule,
    WorkspaceAuthorizationModule,
    ConfigModule,
  ],
  controllers: [GitlabController, GitlabOAuthController],
  providers: [
    GitlabAuthorizationService,
    GitlabConnectionService,
    GitlabCredentialService,
    GitlabProjectConfigService,
    GitlabAdapter,
    GitlabCiService,
    GitlabClient,
    GitlabFileService,
    GitlabWebhookConfiguratorService,
    GitlabOnboardingService,
    GitlabImageRefService,
    GitlabPipelinePersistenceService,
    GitlabWebhookHandler,
  ],
  exports: [
    GitlabAdapter,
    GitlabClient,
    GitlabConnectionService,
    GitlabFileService,
    GitlabWebhookConfiguratorService,
    GitlabPipelinePersistenceService,
    GitlabWebhookHandler,
  ],
})
export class GitlabModule {}
