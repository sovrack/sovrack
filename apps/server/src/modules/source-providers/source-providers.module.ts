import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { GitlabModule } from './adapters/gitlab/gitlab.module';
import { GithubModule } from './adapters/github/github.module';
import { GiteaModule } from './adapters/gitea/gitea.module';
import { GitProviderConfigModule } from './shared/connection/git-provider-config.module';
import { SourceProvidersController } from './source-providers.controller';
import { SourceProvidersService } from './source-providers.service';
import { SourceController } from './source.controller';

@Module({
  imports: [
    PrismaModule,
    GitlabModule,
    GithubModule,
    GiteaModule,
    GitProviderConfigModule,
  ],
  controllers: [SourceProvidersController, SourceController],
  providers: [SourceProvidersService],
  exports: [SourceProvidersService, GitlabModule, GithubModule, GiteaModule],
})
export class SourceProvidersModule {}
