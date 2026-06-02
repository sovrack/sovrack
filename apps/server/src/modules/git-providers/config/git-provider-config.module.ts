import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../core/database/prisma.module';
import { CryptoModule } from '../../../core/crypto/crypto.module';
import { GitProviderConfigService } from './git-provider-config.service';
import { GitProviderOauthService } from './git-provider-oauth.service';

@Module({
  imports: [PrismaModule, HttpModule, CryptoModule],
  providers: [GitProviderConfigService, GitProviderOauthService],
  exports: [GitProviderConfigService, GitProviderOauthService],
})
export class GitProviderConfigModule {}
