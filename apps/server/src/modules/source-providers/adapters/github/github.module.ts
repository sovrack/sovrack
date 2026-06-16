import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../core/database/prisma.module';
import { GitProviderConfigModule } from '../../shared/connection/git-provider-config.module';
import { PlatformModule } from '../../../platform';
import { GithubClient } from './github.client';
import { GithubController } from './github.controller';
import { GithubAdapter } from './github.adapter';
import { GithubWebhookHandler } from './github-webhook.handler';
import { GithubFileService } from './github-file.service';
import { GithubWebhookConfiguratorService } from './github-webhook-configurator.service';

@Module({
  imports: [PrismaModule, HttpModule, GitProviderConfigModule, PlatformModule],
  controllers: [GithubController],
  providers: [
    GithubAdapter,
    GithubClient,
    GithubWebhookHandler,
    GithubFileService,
    GithubWebhookConfiguratorService,
  ],
  exports: [
    GithubAdapter,
    GithubClient,
    GithubWebhookHandler,
    GithubFileService,
    GithubWebhookConfiguratorService,
  ],
})
export class GithubModule {}
