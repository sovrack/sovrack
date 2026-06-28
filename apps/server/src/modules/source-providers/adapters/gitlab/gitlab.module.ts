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
import { GitlabWebhookHandler } from './gitlab-webhook.handler';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    CryptoModule,
    GitProviderConfigModule,
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
    GitlabWebhookHandler,
    GitlabFileService,
    GitlabWebhookConfiguratorService,
  ],
  exports: [
    GitlabAdapter,
    GitlabClient,
    GitlabConnectionService,
    GitlabWebhookHandler,
    GitlabFileService,
    GitlabWebhookConfiguratorService,
  ],
})
export class GitlabModule {}
