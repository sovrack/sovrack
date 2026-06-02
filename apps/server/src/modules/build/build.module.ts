import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { CryptoModule } from '../../core/crypto/crypto.module';
import { GitlabModule } from '../git-providers/gitlab/gitlab.module';
import { BuildController } from './build.controller';
import { BuildDetectorService } from './build-detector.service';
import { BuildGeneratorService } from './build-generator.service';
import { BuildService } from './build.service';
import { BuildSetupService } from './services/build-setup.service';
import { LocalBuildEngineService } from './local-build-engine.service';
import { DockerImageService } from './image/docker-image.service';
import { DockerfileGenerator } from './generators/dockerfile/dockerfile.generator';
import { GitlabCiGenerator } from './generators/gitlab-ci.generator';
import { DockerignoreGenerator } from './generators/dockerignore.generator';
import { GitlabFilePusherService } from './pusher/gitlab-file-pusher.service';
import { GitlabWebhookConfiguratorService } from './pusher/gitlab-webhook-configurator.service';

@Module({
  imports: [PrismaModule, HttpModule, CryptoModule, GitlabModule],
  controllers: [BuildController],
  providers: [
    BuildService,
    BuildSetupService,
    BuildDetectorService,
    DockerfileGenerator,
    GitlabCiGenerator,
    DockerignoreGenerator,
    GitlabFilePusherService,
    GitlabWebhookConfiguratorService,
    BuildGeneratorService,
    LocalBuildEngineService,
    DockerImageService,
  ],
  exports: [BuildService, BuildSetupService, LocalBuildEngineService, DockerImageService],
})
export class BuildModule {}
