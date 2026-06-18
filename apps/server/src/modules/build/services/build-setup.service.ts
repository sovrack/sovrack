import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AppSourceType, Role } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { BuildOrchestratorService } from '../build-orchestrator.service';
import { CreateBuildConfigDto } from '../dto/create-build-config.dto';
import { GitProvidersService } from '../../git-providers/git-providers.service';
import { NixpacksService } from '../engines/nixpacks/nixpacks.service';
import type {
  BuildArtifactStatus,
  BuildPrepareStatus,
  BuildPrepareServiceResult,
} from '../types/build-prepare.types';

const SUPPORTED_TYPES = [
  'nestjs',
  'nextjs',
  'react',
  'nodejs',
  'go',
  'python',
  'django',
  'laravel',
  'spring-boot',
  'java',
  'php',
  'ruby',
  'golang',
  'rust',
  'postgres-service',
  'redis-service',
  'static-frontend',
  'static',
  'dockerized',
  'compose',
  'docker',
  'unknown',
];

@Injectable()
export class BuildSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buildService: BuildOrchestratorService,
    private readonly gitProvidersService: GitProvidersService,
    private readonly nixpacksService: NixpacksService,
  ) {}

  async getTemplates(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<{ types: string[] }> {
    await this.buildService.assertCanConfigureBuild(projectId, userId, userRole);
    return { types: SUPPORTED_TYPES };
  }

  async updateBuildConfig(
    projectId: string,
    dto: CreateBuildConfigDto,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.buildService.assertCanConfigureBuild(projectId, userId, userRole);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(dto.defaultBuildSource !== undefined && {
          defaultBuildSource: dto.defaultBuildSource,
        }),
        ...(dto.projectType !== undefined && { projectType: dto.projectType }),
        ...(dto.buildPort !== undefined && { buildPort: dto.buildPort }),
        ...(dto.buildStartCmd !== undefined && {
          buildStartCmd: dto.buildStartCmd,
        }),
        // autoDeploy/autoDeployBranch are owned by Environment now (single
        // source of truth); no longer persisted at Project level.
        ...(dto.dockerfileContent !== undefined && {
          dockerfileContent: dto.dockerfileContent,
        }),
        ...(dto.gitlabCiContent !== undefined && {
          ciConfigContent: dto.gitlabCiContent,
        }),
        ...(dto.dockerComposeContent !== undefined && {
          dockerComposeContent: dto.dockerComposeContent,
        }),
        ...(dto.nixpacksConfig !== undefined && {
          nixpacksConfig: dto.nixpacksConfig || null,
        }),
        ...(dto.staticConfig !== undefined && {
          staticConfig: dto.staticConfig || null,
        }),
      },
    });
  }

  async prepareAll(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<{ results: BuildPrepareServiceResult[] }> {
    await this.buildService.assertCanConfigureBuild(projectId, userId, userRole);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        appProviderLink: { select: { sourceType: true } },
      },
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    const services = await this.prisma.projectService.findMany({
      where: { projectId },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });

    if (
      project.appProviderLink?.sourceType === AppSourceType.GROUP &&
      services.length === 0
    ) {
      throw new BadRequestException(
        'Aucun service trouvé pour ce projet GROUP. Importez les repositories comme services avant la préparation.',
      );
    }

    const targets =
      services.length > 0
        ? services.map((service) => ({
            serviceId: service.id,
            serviceName: service.name,
          }))
        : [
            {
              serviceId: project.id,
              serviceName: project.name,
            },
          ];

    const results: BuildPrepareServiceResult[] = [];

    for (const target of targets) {
      try {
        const prepared = await this.buildService.prepareServiceInternal(
          projectId,
          services.length > 0 ? target.serviceId : undefined,
        );
        results.push(prepared.serviceResult);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Erreur inconnue';
        results.push({
          serviceId: target.serviceId,
          serviceName: target.serviceName,
          status: 'FAILED',
          message: msg,
          dockerfileStatus: 'FAILED',
          dockerignoreStatus: 'FAILED',
          ciStatus: 'FAILED',
          pipelineUrl: null,
        });
      }
    }

    return { results };
  }

  async reconcileWebhooks(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<{ results: BuildPrepareServiceResult[] }> {
    await this.buildService.assertCanConfigureBuild(projectId, userId, userRole);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        appProviderLink: { select: { sourceType: true } },
      },
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    const services = await this.prisma.projectService.findMany({
      where: { projectId },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });

    if (
      project.appProviderLink?.sourceType === AppSourceType.GROUP &&
      services.length === 0
    ) {
      throw new BadRequestException(
        'Aucun service trouvé pour ce projet GROUP. Importez les repositories comme services avant la configuration des webhooks.',
      );
    }

    const targets =
      services.length > 0
        ? services.map((service) => ({
            serviceId: service.id,
            serviceName: service.name,
          }))
        : [
            {
              serviceId: project.id,
              serviceName: project.name,
            },
          ];

    const results: BuildPrepareServiceResult[] = targets.map((target) => ({
      serviceId: target.serviceId,
      serviceName: target.serviceName,
      status: 'SUCCESS' as const,
      message:
        'La configuration webhook est désormais gérée via POST /projects/:projectId/webhook/configure.',
      dockerfileStatus: 'SKIPPED' as const,
      dockerignoreStatus: 'SKIPPED' as const,
      ciStatus: 'SKIPPED' as const,
      pipelineUrl: null,
    }));

    return { results };
  }

  async getBuildStatus(projectId: string): Promise<{
    projectDockerfileReady: boolean;
    projectCiReady: boolean;
    sourceType: 'REPO' | 'GROUP' | null;
    services: Array<{
      id: string;
      name: string;
      type: string;
      repositoryPath: string | null;
      defaultBranch: string;
      externalRepoId: string | null;
      ready: boolean;
      missingRequirements: string[];
      lastPipeline: {
        id: number;
        status: string;
        ref: string;
        webUrl: string;
      } | null;
    }>;
  }> {
    const [project, services] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: {
          dockerfileContent: true,
          ciConfigContent: true,
          appProviderLink: {
            select: {
              sourceType: true,
              providerToken: true,
            },
          },
        },
      }),
      this.prisma.projectService.findMany({
        where: { projectId },
        include: {
          pipelineRuns: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { externalId: true, status: true, branch: true, webUrl: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const sourceType = project?.appProviderLink?.sourceType ?? null;
    const tokenConfigured = Boolean(project?.appProviderLink?.providerToken);

    return {
      projectDockerfileReady: Boolean(project?.dockerfileContent),
      projectCiReady: Boolean(project?.ciConfigContent),
      sourceType,
      services: services.map((service) => {
        const missingRequirements: string[] = [];

        if (!tokenConfigured) {
          missingRequirements.push('Token GitLab manquant');
        }
        if (!service.externalRepoId) {
          missingRequirements.push('GitLab project ID manquant');
        }
        if (!service.defaultBranch?.trim()) {
          missingRequirements.push('Branche manquante');
        }
        if (sourceType === AppSourceType.GROUP && !service.repositoryPath) {
          missingRequirements.push('repositoryPath manquant');
        }

        return {
          id: service.id,
          name: service.name,
          type: service.type,
          repositoryPath: service.repositoryPath,
          defaultBranch: service.defaultBranch,
          externalRepoId: service.externalRepoId
            ? String(service.externalRepoId)
            : null,
          ready: missingRequirements.length === 0,
          missingRequirements,
          lastPipeline: service.pipelineRuns[0]
            ? {
                id: Number(service.pipelineRuns[0].externalId),
                status: service.pipelineRuns[0].status,
                ref: service.pipelineRuns[0].branch ?? '',
                webUrl: service.pipelineRuns[0].webUrl ?? '',
              }
            : null,
        };
      }),
    };
  }

  /**
   * Extract a docker-compose.yml from the linked GitLab repository.
   *
   * Strategy:
   *   1. List files in repo (recursive) and look for the standard compose
   *      filenames at root, then in subdirectories.
   *   2. Fetch the raw content via the GitLab repository-files API.
   *   3. Update the project's `dockerComposeContent` so the deployment
   *      service can use it directly.
   *
   * Throws NotFoundException if no compose file is found.
   */
  async extractComposeFile(
    projectId: string,
    serviceId?: string,
  ): Promise<{ content: string; filePath: string }> {
    const logger = new Logger('BuildSetupService.extractComposeFile');

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        branch: true,
        services: serviceId
          ? { where: { id: serviceId }, select: { defaultBranch: true } }
          : { take: 1, orderBy: { createdAt: 'asc' }, select: { defaultBranch: true } },
      },
    });
    if (!project) throw new NotFoundException('Projet non trouvé');

    const ref =
      (serviceId ? project.services[0]?.defaultBranch : null) ??
      project.branch ??
      'main';

    const provider = await this.gitProvidersService.forProject(projectId);

    const candidates = [
      'docker-compose.yml',
      'docker-compose.yaml',
      'compose.yml',
      'compose.yaml',
    ];

    let content: string | null = null;
    let filePath: string | null = null;

    for (const candidate of candidates) {
      content = await provider.readFile(projectId, candidate, ref);
      if (content !== null) {
        filePath = candidate;
        break;
      }
    }

    if (!content || !filePath) {
      throw new NotFoundException(
        'Aucun fichier docker-compose.{yml,yaml} trouvé dans le dépôt',
      );
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: { dockerComposeContent: content },
    });

    logger.log(`docker-compose extrait depuis ${filePath} (${content.length} chars)`);
    return { content, filePath };
  }

  /**
   * Returns the list of build engines available on the platform.
   * Used by the UI to populate the build strategy selector.
   *
   * Each engine has:
   *   - key: enum value (BuildStrategy)
   *   - label: human-readable name
   *   - description: when to use it
   *   - requiresDockerfile: whether a Dockerfile is needed
   *   - supportsLocal: whether the build can run on the VPS without registry
   *   - available: whether the engine is installed/configured
   */
  async getAvailableEngines(): Promise<
    Array<{
      key: string;
      label: string;
      description: string;
      requiresDockerfile: boolean;
      supportsLocal: boolean;
      available: boolean;
      installedVersion?: string;
    }>
  > {
    const nixpacksVersion = this.nixpacksService.getVersion();
    return [
      {
        key: 'DOCKERFILE',
        label: 'Dockerfile (auto-généré)',
        description:
          'platform génère un Dockerfile optimisé pour votre framework (15 langages supportés). Vous pouvez aussi fournir votre propre Dockerfile.',
        requiresDockerfile: false,
        supportsLocal: true,
        available: true,
      },
      {
        key: 'NIXPACKS',
        label: 'Nixpacks (auto-détection)',
        description:
          'Coolify/Dokploy-style. Nixpacks détecte automatiquement le langage/framework, génère un Dockerfile optimisé, et build avec cache Nix. Aucun Dockerfile requis.',
        requiresDockerfile: false,
        supportsLocal: true,
        available: Boolean(nixpacksVersion),
        installedVersion: nixpacksVersion ?? undefined,
      },
      {
        key: 'BUILDPACK',
        label: 'Buildpacks (pack CLI)',
        description:
          'Heroku-style buildpacks. Détection automatique de l\'image de base, support de Heroku, Google, Paketo buildpacks.',
        requiresDockerfile: false,
        supportsLocal: true,
        available: true,
      },
      {
        key: 'DOCKER_COMPOSE',
        label: 'Docker Compose',
        description:
          'Pour les apps multi-services (frontend + backend + DB). Le contenu docker-compose.yml peut être auto-extrait du repo ou saisi manuellement.',
        requiresDockerfile: false,
        supportsLocal: true,
        available: true,
      },
      {
        key: 'STATIC',
        label: 'Site statique (sans Docker)',
        description:
          'Pour les frontends statiques (Astro, Hugo, Jekyll, Gatsby). platform exécute le build puis sert les fichiers via Nginx — pas de Docker.',
        requiresDockerfile: false,
        supportsLocal: true,
        available: true,
      },
      {
        key: 'NONE',
        label: 'Image externe (pull only)',
        description:
          'Aucune construction. platform pull une image Docker existante depuis un registry et la déploie.',
        requiresDockerfile: false,
        supportsLocal: false,
        available: true,
      },
    ];
  }
}
