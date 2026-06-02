import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../core/database/prisma.module';
import { GitProviderConfigModule } from '../config/git-provider-config.module';
import { GithubApiService } from './github-api.service';
import { GithubController } from './github.controller';
import { GithubService } from './github.service';
import { GithubWebhookService } from './github-webhook.service';

@Module({
  imports: [PrismaModule, HttpModule, GitProviderConfigModule],
  controllers: [GithubController],
  providers: [GithubService, GithubApiService, GithubWebhookService],
  exports: [GithubService, GithubApiService, GithubWebhookService],
})
export class GithubModule {}
