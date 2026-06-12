import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../core/database/prisma.module';
import { GitProviderConfigModule } from '../../shared/connection/git-provider-config.module';
import { PlatformModule } from '../../../platform';
import { GithubApiService } from './github-api.service';
import { GithubController } from './github.controller';
import { GithubAdapter } from './github.adapter';
import { GithubWebhookService } from './github-webhook.service';
import { GithubFileService } from './github-file.service';
import { GithubWebhookConfiguratorService } from './github-webhook-configurator.service';

@Module({
  imports: [PrismaModule, HttpModule, GitProviderConfigModule, PlatformModule],
  controllers: [GithubController],
  providers: [GithubAdapter, GithubApiService, GithubWebhookService, GithubFileService, GithubWebhookConfiguratorService],
  exports: [GithubAdapter, GithubApiService, GithubWebhookService, GithubFileService, GithubWebhookConfiguratorService],
})
export class GithubModule {}
