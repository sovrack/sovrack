import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/database/prisma.module';
import { GitProviderConfigModule } from '../../shared/connection/git-provider-config.module';
import { PlatformModule } from '../../../platform';
import { GithubClient } from './github.client';
import { GithubController } from './github.controller';
import { GithubAdapter } from './github.adapter';
import { GithubFileService } from './github-file.service';
import { GithubWebhookConfiguratorService } from './github-webhook-configurator.service';
import { GithubWebhookHandler } from './github-webhook.handler';

@Module({
  imports: [PrismaModule, HttpModule, GitProviderConfigModule, PlatformModule],
  controllers: [GithubController],
  providers: [
    GithubAdapter,
    GithubClient,
    GithubFileService,
    GithubWebhookConfiguratorService,
    GithubWebhookHandler,
  ],
  exports: [
    GithubAdapter,
    GithubClient,
    GithubFileService,
    GithubWebhookConfiguratorService,
    GithubWebhookHandler,
  ],
})
export class GithubModule {}
