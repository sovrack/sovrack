import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { CryptoModule } from '../../core/crypto/crypto.module';
import { SourceProvidersModule } from '../source-providers/source-providers.module';
import { PlatformModule } from '../platform/platform.module';
import { BuildController } from './build.controller';
import { BuildDetectorService } from './detection/build-detector.service';
import { BuildOrchestratorService } from './build-orchestrator.service';
import { BuildSetupService } from './services/build-setup.service';
import { BuildLifecycleService } from './services/build-lifecycle.service';
import { BuildImageService } from './services/build-image.service';
import { DockerfileGenerator } from './generators/config-files/dockerfile.generator';
import { GitlabCiGenerator } from './generators/ci/gitlab-ci.generator';
import { GithubActionsGenerator } from './generators/ci/github-actions.generator';
import { CiGeneratorFactory } from './generators/ci/ci-generator.factory';
import { DockerignoreGenerator } from './generators/config-files/dockerignore.generator';
import { NixpacksModule } from './engines/nixpacks/nixpacks.module';
import { BuildStrategyResolver } from './strategies/build-strategy.resolver';

@Module({
  imports: [PrismaModule, HttpModule, CryptoModule, SourceProvidersModule, PlatformModule, NixpacksModule],
  controllers: [BuildController],
  providers: [
    BuildOrchestratorService,
    BuildSetupService,
    BuildLifecycleService,
    BuildDetectorService,
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
