import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/database/prisma.module';
import { CryptoModule } from '../../../../shared/crypto/crypto.module';
import { GitProviderConfigService } from './git-provider-config.service';
import { GitProviderOauthService } from './git-provider-oauth.service';
import { GitProviderLegacySyncService } from './git-provider-legacy-sync.service';
import { GithubProviderService } from './github-provider.service';
import { GitlabConnectionTesterService } from './gitlab-connection-tester.service';

@Module({
  imports: [PrismaModule, HttpModule, CryptoModule],
  providers: [
    GitProviderConfigService,
    GitProviderOauthService,
    GitProviderLegacySyncService,
    GithubProviderService,
    GitlabConnectionTesterService,
  ],
  exports: [GitProviderConfigService, GitProviderOauthService],
})
export class GitProviderConfigModule {}
