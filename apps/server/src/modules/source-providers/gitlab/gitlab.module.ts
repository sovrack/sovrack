import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../core/database/prisma.module';
import { CryptoModule } from '../../../core/crypto/crypto.module';
import { GitProviderConfigModule } from '../config/git-provider-config.module';
import { GitlabApiService } from './gitlab-api.service';
import { GitlabCiService } from './gitlab-ci.service';
import { GitlabController } from './gitlab.controller';
import { GitlabAuthorizationService } from './gitlab-authorization.service';
import { GitlabConnectionService } from './gitlab-connection.service';
import { GitlabCoreService } from './gitlab-core.service';
import { GitlabProjectConfigService } from './gitlab-project-config.service';
import { GitlabCredentialService } from './gitlab-credential.service';
import { GitlabFileService } from './gitlab-file.service';
import { GitlabWebhookConfiguratorService } from './gitlab-webhook-configurator.service';
import { GitlabOAuthController } from './gitlab-oauth.controller';
import { GitlabWebhookService } from './gitlab-webhook.service';

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
    GitlabCoreService,
    GitlabCiService,
    GitlabApiService,
    GitlabWebhookService,
    GitlabFileService,
    GitlabWebhookConfiguratorService,
  ],
  exports: [
    GitlabCoreService,
    GitlabApiService,
    GitlabConnectionService,
    GitlabWebhookService,
    GitlabFileService,
    GitlabWebhookConfiguratorService,
  ],
})
export class GitlabModule {}
