import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../core/database/prisma.module';
import { GitProviderConfigModule } from '../config/git-provider-config.module';
import { WebhooksService } from '../webhooks/webhooks.service';
import { GitlabApiService } from './gitlab-api.service';
import { GitlabCiService } from './gitlab-ci.service';
import { GitlabController } from './gitlab.controller';
import { GitlabCoreService } from './gitlab-core.service';
import { GitlabCryptoService } from './gitlab-crypto.service';
import { GitlabFileService } from './gitlab-file.service';
import { GitlabWebhookConfiguratorService } from './gitlab-webhook-configurator.service';
import { GitlabOAuthController } from './gitlab-oauth.controller';
import { GitlabService } from './gitlab.service';
import { GitlabWebhookService } from './gitlab-webhook.service';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    GitProviderConfigModule,
    ConfigModule,
  ],
  controllers: [GitlabController, GitlabOAuthController],
  providers: [
    GitlabService,
    GitlabCoreService,
    GitlabCiService,
    GitlabApiService,
    GitlabWebhookService,
    GitlabCryptoService,
    GitlabFileService,
    GitlabWebhookConfiguratorService,
    WebhooksService,
  ],
  exports: [
    GitlabService,
    GitlabApiService,
    GitlabWebhookService,
    GitlabCryptoService,
    GitlabFileService,
    GitlabWebhookConfiguratorService,
  ],
})
export class GitlabModule {}
