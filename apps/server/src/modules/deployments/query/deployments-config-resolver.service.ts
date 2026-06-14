import { Injectable, Logger } from '@nestjs/common';
import {
  BuildPack,
  ManagedServiceType,
  Prisma,
  ServiceType,
} from '@prisma/client';
import type { BuildSource } from '../../build/strategies/build-strategy.interface';
import { CreateDeploymentDto } from '../dto/create-deployment.dto';
import { BuildImageService } from '../../build/lifecycle/build-image.service';
import { sanitizeDockerTag } from '../../../core/utils/docker-tag.util';

export type DeploymentConfig = {
  branch: string;
  buildSource: BuildSource;
  isLocalBuild: boolean;
  dockerImage: string;
  resolvedNixpacksConfig: Prisma.InputJsonValue | null;
  resolvedStaticConfig: Prisma.InputJsonValue | null;
};

export type DatabaseImageConfig = {
  image: string;
  port: number;
  volumes: { containerPath: string }[];
};

@Injectable()
export class DeploymentsConfigResolver {
  private readonly logger = new Logger(DeploymentsConfigResolver.name);

  constructor(private readonly dockerService: BuildImageService) {}

  async resolve(dto: CreateDeploymentDto, service: any, project: any): Promise<DeploymentConfig> {
    const buildSource = this.resolveBuildSource(dto, service);
    const isLocalBuild = this.isLocalBuildSource(buildSource);

    const branch = dto.branch ?? service.branch ?? 'main';

    const dockerImage = await this.resolveDockerImage(dto, buildSource, service, project, branch);

    const resolvedNixpacksConfig =
      dto.nixpacksConfig ??
      (service.nixpacksConfig as Prisma.InputJsonValue | null) ??
      null;

    const resolvedStaticConfig =
      dto.staticConfig ??
      (service.staticConfig as Prisma.InputJsonValue | null) ??
      null;

    return {
      branch,
      buildSource,
      isLocalBuild,
      dockerImage,
      resolvedNixpacksConfig,
      resolvedStaticConfig,
    };
  }

  private async resolveDockerImage(
    dto: CreateDeploymentDto,
    buildSource: BuildSource,
    service: any,
    project: any,
    branch: string,
  ): Promise<string> {
    if (buildSource === 'EXTERNAL_IMAGE') {
      if (!dto.overrideImage) throw new Error('overrideImage est requis pour EXTERNAL_IMAGE');
      return dto.overrideImage;
    }
    if (buildSource === 'DOCKER_COMPOSE') {
      return `compose://${project.name}`;
    }
    if (this.isLocalBuildSource(buildSource)) {
      return `${sanitizeDockerTag(project.name)}:${sanitizeDockerTag(branch || 'latest')}`;
    }
    return this.dockerService.buildDockerImage({
      projectId: project.id,
      projectName: `${project.name}-${service.name}`,
      branch,
      serviceId: service.id,
    });
  }

  resolveBuildSource(
    dto: CreateDeploymentDto,
    service: { buildPack: BuildPack | null },
  ): BuildSource {
    if (dto.buildSource) return dto.buildSource;
    if (dto.overrideImage) return 'EXTERNAL_IMAGE';
    const pack = service?.buildPack;
    if (pack === BuildPack.STATIC) return 'STATIC';
    if (pack === BuildPack.DOCKER_COMPOSE) return 'DOCKER_COMPOSE';
    if (pack === BuildPack.NIXPACKS) return 'NIXPACKS_LOCAL';
    return 'DOCKERFILE_REGISTRY';
  }

  isLocalBuildSource(src: BuildSource): boolean {
    return (
      src === 'DOCKERFILE_LOCAL' ||
      src === 'NIXPACKS_LOCAL' ||
      src === 'STATIC' ||
      src === 'DOCKER_COMPOSE'
    );
  }

  buildSourceToBuildPack(src: BuildSource): BuildPack {
    if (src === 'DOCKERFILE_REGISTRY' || src === 'DOCKERFILE_LOCAL') return BuildPack.DOCKERFILE;
    if (src === 'NIXPACKS_REGISTRY' || src === 'NIXPACKS_LOCAL') return BuildPack.NIXPACKS;
    if (src === 'DOCKER_COMPOSE') return BuildPack.DOCKER_COMPOSE;
    if (src === 'STATIC') return BuildPack.STATIC;
    return BuildPack.NONE;
  }

  getDatabaseImage(service: {
    databaseType: ManagedServiceType | null;
    databaseVersion?: string | null;
  }): DatabaseImageConfig {
    const version = service.databaseVersion || 'latest';
    switch (service.databaseType!) {
      case 'POSTGRES':
        return { image: `postgres:${version}-alpine`, port: 5432, volumes: [{ containerPath: '/var/lib/postgresql/data' }] };
      case 'MYSQL':
        return { image: `mysql:${version}-oracle`, port: 3306, volumes: [{ containerPath: '/var/lib/mysql' }] };
      case 'REDIS':
        return { image: `redis:${version}-alpine`, port: 6379, volumes: [{ containerPath: '/data' }] };
      case 'MONGODB':
        return { image: `mongo:${version}`, port: 27017, volumes: [{ containerPath: '/data/db' }] };
      case 'RABBITMQ':
        return { image: `rabbitmq:${version}-alpine`, port: 5672, volumes: [{ containerPath: '/var/lib/rabbitmq' }] };
    }
  }
}
