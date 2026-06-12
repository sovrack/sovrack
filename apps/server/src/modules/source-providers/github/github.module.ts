import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../core/database/prisma.module';
import { GitProviderConfigModule } from '../config/git-provider-config.module';
import { PlatformModule } from '../../platform';
import { GithubApiService } from './github-api.service';
import { GithubController } from './github.controller';
import { GithubService } from './github.service';
import { GithubWebhookService } from './github-webhook.service';
import { GithubFileService } from './github-file.service';
import { GithubWebhookConfiguratorService } from './github-webhook-configurator.service';

@Module({
  imports: [PrismaModule, HttpModule, GitProviderConfigModule, PlatformModule],
  controllers: [GithubController],
  providers: [GithubService, GithubApiService, GithubWebhookService, GithubFileService, GithubWebhookConfiguratorService],
  exports: [GithubService, GithubApiService, GithubWebhookService, GithubFileService, GithubWebhookConfiguratorService],
})
export class GithubModule {}
