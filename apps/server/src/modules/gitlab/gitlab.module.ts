import { HttpModule } from '@nestjs/axios';
import { Module, forwardRef } from '@nestjs/common';
import { DeploymentsModule } from '../deployments/deployments.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { GitlabApiService } from './gitlab-api.service';
import { GitlabController } from './gitlab.controller';
import { GitlabCoreService } from './gitlab-core.service';
import { GitlabCryptoService } from './gitlab-crypto.service';
import { GitlabService } from './gitlab.service';
import { GitlabWebhookService } from './gitlab-webhook.service';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    PlatformConfigModule,
    forwardRef(() => DeploymentsModule),
  ],
  controllers: [GitlabController],
  providers: [
    GitlabService,
    GitlabCoreService,
    GitlabApiService,
    GitlabWebhookService,
    GitlabCryptoService,
  ],
  exports: [
    GitlabService,
    GitlabApiService,
    GitlabWebhookService,
    GitlabCryptoService,
  ],
})
export class GitlabModule {}
