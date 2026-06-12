import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { GitlabModule } from './adapters/gitlab/gitlab.module';
import { GithubModule } from './adapters/github/github.module';
import { GitProviderConfigModule } from './config/git-provider-config.module';
import { SourceProvidersController } from './source-providers.controller';
import { SourceProvidersService } from './source-providers.service';
import { SourceController } from './source.controller';

@Module({
  imports: [
    PrismaModule,
    GitlabModule,
    GithubModule,
    GitProviderConfigModule,
  ],
  controllers: [SourceProvidersController, SourceController],
  providers: [SourceProvidersService],
  exports: [
    SourceProvidersService,
    GitlabModule,
    GithubModule,
  ],
})
export class SourceProvidersModule {}
