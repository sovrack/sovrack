import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import {
  IWebhookHandler,
  WEBHOOK_HANDLER,
} from '../../shared/webhook/webhook-handler.interface';
import { GitlabModule } from './adapters/gitlab/gitlab.module';
import { GitlabWebhookHandler } from './adapters/gitlab/gitlab-webhook.handler';
import { GithubModule } from './adapters/github/github.module';
import { GithubWebhookHandler } from './adapters/github/github-webhook.handler';
import { GitProviderConfigModule } from './shared/connection/git-provider-config.module';
import { SourceProvidersController } from './source-providers.controller';
import { SourceProvidersService } from './source-providers.service';
import { SourceController } from './source.controller';

@Module({
  imports: [PrismaModule, GitlabModule, GithubModule, GitProviderConfigModule],
  controllers: [SourceProvidersController, SourceController],
  providers: [
    SourceProvidersService,
    {
      provide: WEBHOOK_HANDLER,
      useFactory: (
        gitlabHandler: IWebhookHandler,
        githubHandler: IWebhookHandler,
      ): IWebhookHandler[] => [gitlabHandler, githubHandler],
      inject: [GitlabWebhookHandler, GithubWebhookHandler],
    },
  ],
  exports: [
    SourceProvidersService,
    GitlabModule,
    GithubModule,
    WEBHOOK_HANDLER,
  ],
})
export class SourceProvidersModule {}
