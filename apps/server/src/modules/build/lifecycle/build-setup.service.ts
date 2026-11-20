import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { activeWhere } from '../../../shared/database/prisma-active.helper';
import { BuildOrchestratorService } from '../build-orchestrator.service';
import { CreateBuildConfigDto } from '../dto/create-build-config.dto';
import { SourceProvidersService } from '../../source-providers/source-providers.service';
import { NixpacksService } from '../engines/nixpacks/nixpacks.service';
import type { BuildPrepareServiceResult } from '../types/build-prepare.types';

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
    private readonly gitProvidersService: SourceProvidersService,
    private readonly nixpacksService: NixpacksService,
  ) {}

  async getTemplates(
    projectId: string,
    userId: string,
    userRole: Role,
    expectedWorkspaceId?: string,
  ): Promise<{ types: string[] }> {
    await this.buildService.assertCanConfigureBuild(
      projectId,
      userId,
      userRole,
      expectedWorkspaceId,
    );
    return { types: SUPPORTED_TYPES };
  }

  async updateBuildConfig(
    projectId: string,
    dto: CreateBuildConfigDto,
    userId: string,
    userRole: Role,
    serviceId?: string,
    expectedWorkspaceId?: string,
  ): Promise<void> {
    if (dto.dockerComposeContent !== undefined) {
      throw new BadRequestException(
        'Les services Docker Compose ne sont pas disponibles dans la V1',
      );
    }
    await this.buildService.assertCanConfigureBuild(
      projectId,
      userId,
      userRole,
      expectedWorkspaceId,
    );

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    const where = activeWhere(
      serviceId ? { id: serviceId, projectId } : { projectId },
    );
    const services = await this.prisma.service.findMany({
      where,
      select: { id: true },
    });

    const data = {
      ...(dto.projectType !== undefined && { buildType: dto.projectType }),
      ...(dto.buildPort !== undefined && { port: dto.buildPort }),
      ...(dto.buildStartCmd !== undefined && {
        startCommand: dto.buildStartCmd,
      }),
      ...(dto.dockerfileContent !== undefined && {
        dockerfile: dto.dockerfileContent,
      }),
      ...(dto.dockerComposeContent !== undefined && {
        dockerComposeContent: dto.dockerComposeContent,
      }),
      ...(dto.nixpacksConfig !== undefined && {
        nixpacksConfig: dto.nixpacksConfig || Prisma.JsonNull,
      }),
      ...(dto.staticConfig !== undefined && {
        staticConfig: dto.staticConfig || Prisma.JsonNull,
      }),
    };

    if (services.length > 0) {
      await this.prisma.service.updateMany({
        where: { id: { in: services.map((s) => s.id) } },
        data,
      });
    }
  }

  async generateAll(
    projectId: string,
    userId: string,
    userRole: Role,
    expectedWorkspaceId?: string,
  ): Promise<{ results: BuildPrepareServiceResult[] }> {
    await this.buildService.assertCanConfigureBuild(
      projectId,
      userId,
      userRole,
      expectedWorkspaceId,
    );

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    const services = await this.prisma.service.findMany({
      where: activeWhere({ projectId }),
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });

    const hasProvider = await this.prisma.gitProviderRepo.findFirst({
      where: { projectId },
    });

    if (!hasProvider && services.length === 0) {
      throw new BadRequestException(
        'Aucun service ou dépôt Git configuré pour ce projet.',
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
      repoPath: string | null;
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
    const [providerRepo, services] = await Promise.all([
      this.prisma.gitProviderRepo.findFirst({
        where: { projectId },
        include: {
          provider: {
            select: {
              adminToken: true,
              oauthAccessToken: true,
            },
          },
        },
      }),
      this.prisma.service.findMany({
        where: activeWhere({ projectId }),
        orderBy: { createdAt: 'asc' },
        include: {
          provider: {
            select: { adminToken: true, oauthAccessToken: true },
          },
        },
      }),
    ]);

    const projectTokenConfigured = Boolean(
      providerRepo?.provider?.adminToken ||
      providerRepo?.provider?.oauthAccessToken,
    );
    const sourceType = providerRepo ? 'REPO' : null;

    return {
      projectDockerfileReady: services.some((s) => Boolean(s.dockerfile)),
      projectCiReady: false,
      sourceType,
      services: services.map((service) => {
        const missingRequirements: string[] = [];

        // 1 service = 1 dépôt : les prérequis se jugent d'abord sur le
        // SERVICE (repoPath + provider portés par Service) ; le lien
        // projet→repo ne sert que de fallback mono-repo/legacy.
        const tokenConfigured =
          Boolean(
            service.provider?.adminToken || service.provider?.oauthAccessToken,
          ) || projectTokenConfigured;
        const effectiveRepoPath =
          service.repoPath ?? providerRepo?.repoPath ?? null;

        if (!tokenConfigured) {
          missingRequirements.push('Token GitLab manquant');
        }
        if (!effectiveRepoPath) {
          missingRequirements.push('Chemin du dépôt Git manquant');
        }
        if (!service.branch?.trim()) {
          missingRequirements.push('Branche manquante');
        }

        return {
          id: service.id,
          name: service.name,
          // buildType explicite (buildPack/wizard) ; sinon fallback image dockerisee.
          // Le ServiceType (APPLICATION/DATABASE/MANAGED) n'encode plus la strategie.
          type: service.buildType ?? 'dockerized',
          repositoryPath: service.repoPath,
          defaultBranch: service.branch ?? 'main',
          repoPath: effectiveRepoPath,
          ready: missingRequirements.length === 0,
          missingRequirements,
          lastPipeline: null,
        };
      }),
    };
  }

  async extractComposeFile(
    projectId: string,
    serviceId?: string,
  ): Promise<{ content: string; filePath: string }> {
    const logger = new Logger('BuildSetupService.extractComposeFile');

    const repo = await this.prisma.gitProviderRepo.findFirst({
      where: { projectId },
      select: { defaultBranch: true },
    });
    if (!repo) throw new NotFoundException('Aucun dépôt Git configuré');

    let ref = repo.defaultBranch ?? 'main';

    if (serviceId) {
      const svc = await this.prisma.service.findUnique({
        where: { id: serviceId },
        select: { branch: true },
      });
      if (svc?.branch) {
        ref = svc.branch;
      }
    }

    // Invariant : provider lié au SERVICE — résolution par service si dispo.
    const provider = serviceId
      ? await this.gitProvidersService.forService(serviceId)
      : await this.gitProvidersService.forProject(projectId);

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

    const targetSvc = serviceId
      ? await this.prisma.service.findUnique({ where: { id: serviceId } })
      : await this.prisma.service.findFirst({
          where: { projectId },
          orderBy: { createdAt: 'asc' },
        });

    if (targetSvc) {
      await this.prisma.service.update({
        where: { id: targetSvc.id },
        data: { dockerComposeContent: content },
      });
    }

    logger.log(
      `docker-compose extrait depuis ${filePath} (${content.length} chars)`,
    );
    return { content, filePath };
  }

  getAvailableEngines(): Array<{
    key: string;
    label: string;
    description: string;
    requiresDockerfile: boolean;
    supportsLocal: boolean;
    available: boolean;
    installedVersion?: string;
  }> {
    const nixpacksVersion = this.nixpacksService.getVersion();
    return [
      {
        key: 'DOCKERFILE',
        label: 'Dockerfile (auto-généré)',
        description:
          'Sovrack génère un Dockerfile optimisé pour votre framework (15 langages supportés). Vous pouvez aussi fournir votre propre Dockerfile.',
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
        label: 'Buildpacks (pack CLI) — bientôt',
        description:
          "Heroku-style buildpacks (Heroku/Google/Paketo via la CLI `pack`). NON disponible pour l'instant : utilisez Nixpacks (auto-détection équivalente) en attendant l'intégration du moteur pack.",
        requiresDockerfile: false,
        supportsLocal: true,
        // Not wired yet (no `pack` engine) — kept visible as a roadmap item but
        // marked unavailable so the UI disables it (no broken build path).
        available: false,
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
          'Pour les frontends statiques (Astro, Hugo, Jekyll, Gatsby). Sovrack exécute le build puis sert les fichiers via Nginx — pas de Docker.',
        requiresDockerfile: false,
        supportsLocal: true,
        available: true,
      },
      {
        key: 'NONE',
        label: 'Image externe (pull only)',
        description:
          'Aucune construction. Sovrack pull une image Docker existante depuis un registry et la déploie.',
        requiresDockerfile: false,
        supportsLocal: false,
        available: true,
      },
    ];
  }
}
