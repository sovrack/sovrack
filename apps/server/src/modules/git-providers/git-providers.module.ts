import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { GitlabModule } from './gitlab/gitlab.module';
import { GithubModule } from './github/github.module';
import { GitProviderConfigModule } from './config/git-provider-config.module';
import { GitProvidersController } from './git-providers.controller';
import { GitProvidersService } from './git-providers.service';
import { SourceController } from './source.controller';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    PrismaModule,
    GitlabModule,
    GithubModule,
    GitProviderConfigModule,
    WebhooksModule,
  ],
  controllers: [GitProvidersController, SourceController],
  providers: [GitProvidersService],
  exports: [
    GitProvidersService,
    GitlabModule,
    GithubModule,
    WebhooksModule,
  ],
})
export class GitProvidersModule {}
