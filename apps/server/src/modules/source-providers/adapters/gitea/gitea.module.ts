import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/database/prisma.module';
import { GitProviderConfigModule } from '../../shared/connection/git-provider-config.module';
import { GiteaClient } from './gitea.client';
import { GiteaAdapter } from './gitea.adapter';

@Module({
  imports: [PrismaModule, HttpModule, GitProviderConfigModule],
  providers: [GiteaAdapter, GiteaClient],
  exports: [GiteaAdapter, GiteaClient],
})
export class GiteaModule {}
