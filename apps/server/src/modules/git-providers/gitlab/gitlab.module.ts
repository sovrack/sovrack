import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../core/database/prisma.module';
import { GitProviderConfigModule } from '../config/git-provider-config.module';
import { GitlabApiService } from './gitlab-api.service';
import { GitlabCiService } from './gitlab-ci.service';
import { GitlabController } from './gitlab.controller';
import { GitlabCoreService } from './gitlab-core.service';
import { GitlabCryptoService } from './gitlab-crypto.service';
import { GitlabOAuthController } from './gitlab-oauth.controller';
import { GitlabPollingService } from './gitlab-polling.service';
import { GitlabService } from './gitlab.service';
import { GitlabWebhookService } from './gitlab-webhook.service';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    GitProviderConfigModule,
  ],
  controllers: [GitlabController, GitlabOAuthController],
  providers: [
    GitlabService,
    GitlabCoreService,
    GitlabCiService,
    GitlabApiService,
    GitlabWebhookService,
    GitlabCryptoService,
    GitlabPollingService,
  ],
  exports: [
    GitlabService,
    GitlabApiService,
    GitlabWebhookService,
    GitlabCryptoService,
  ],
})
export class GitlabModule {}
