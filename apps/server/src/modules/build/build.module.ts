import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { CryptoModule } from '../../shared/crypto/crypto.module';
import { SourceProvidersModule } from '../source-providers';
import { PlatformModule } from '../platform';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { BuildController } from './build.controller';
import { BuildDetectorService } from './detection/build-detector.service';
import { RepositoryFileFetcherService } from './detection/repository-file-fetcher.service';
import { BuildOrchestratorService } from './build-orchestrator.service';
import { BuildSetupService } from './lifecycle/build-setup.service';
import { BuildLifecycleService } from './lifecycle/build-lifecycle.service';
import { BuildImageService } from './lifecycle/build-image.service';
import { DockerfileGenerator } from './generation/dockerfiles/dockerfile.generator';
import { GitlabCiGenerator } from './generation/ci/gitlab-ci.generator';
import { GithubActionsGenerator } from './generation/ci/github-actions.generator';
import { CiGeneratorFactory } from './generation/ci/ci-generator.factory';
import { DockerignoreGenerator } from './generation/dockerfiles/dockerignore.generator';
import { NixpacksModule } from './engines/nixpacks/nixpacks.module';
import { BuildStrategyResolver } from './strategies/build-strategy.resolver';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    CryptoModule,
    SourceProvidersModule,
    PlatformModule,
    NixpacksModule,
    // For BuildController.reconcileWebhooks (legacy notice) — see
    // WebhookManagementService.reconcileWebhooksNotice.
    WebhooksModule,
  ],
  controllers: [BuildController],
  providers: [
    BuildOrchestratorService,
    BuildSetupService,
    BuildLifecycleService,
    BuildDetectorService,
    RepositoryFileFetcherService,
    DockerfileGenerator,
    GitlabCiGenerator,
    GithubActionsGenerator,
    CiGeneratorFactory,
    DockerignoreGenerator,
    BuildImageService,
    BuildStrategyResolver,
  ],
  exports: [
    BuildOrchestratorService,
    BuildSetupService,
    BuildLifecycleService,
    BuildImageService,
    NixpacksModule,
    BuildStrategyResolver,
  ],
})
export class BuildModule {}
