import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Deployment,
  DeploymentStatus,
  DeploymentStrategy,
  BuildPack,
  Prisma,
} from '@prisma/client';
import type { BuildSource } from '../../build/strategies/build-strategy.interface';
import { PrismaService } from '../../../core/database/prisma.service';
import { CreateDeploymentDto } from '../dto/create-deployment.dto';
import { DeploymentsAuthorizationService } from './deployments-authorization.service';
import { DeploymentsGateway } from '../gateways/deployments.gateway';
import { DeploymentsExecutorService } from './deployments-executor.service';
import { GitProvidersService } from '../../git-providers/git-providers.service';
import type { PipelineItem } from '../../git-providers/interfaces/git-provider.interface';
import { EnvConfigsService } from '../../configs/env-configs.service';
import { BuildImageService } from '../../build/services/build-image.service';
import { BuildLifecycleService } from '../../build/services/build-lifecycle.service';
import { BuildStrategyResolver } from '../../build/strategies/build-strategy.resolver';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class DeploymentsCreateService {
  private readonly logger = new Logger(DeploymentsCreateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gitProvidersService: GitProvidersService,
    private readonly envConfigsService: EnvConfigsService,
    private readonly gateway: DeploymentsGateway,
    private readonly dockerService: BuildImageService,
    private readonly authorizationService: DeploymentsAuthorizationService,
    private readonly ansibleService: DeploymentsExecutorService,
    private readonly buildsService: BuildLifecycleService,
    private readonly buildStrategyResolver: BuildStrategyResolver,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateDeploymentDto, userId: string): Promise<Deployment> {
    const actor = await this.authorizationService.getActor(userId);
    await this.authorizationService.assertCanDeployProject(
      dto.projectId,
      actor.id,
      actor.role,
    );

    const environment = await this.prisma.environment.findFirst({
      where: {
        id: dto.environmentId,
        projectId: dto.projectId,
      },
      include: {
        server: true,
        serviceTargets: {
          where: dto.serviceId ? { serviceId: dto.serviceId } : undefined,
          include: { server: true },
        },
      },
    });

    if (!environment) {
      throw new NotFoundException('Environnement non trouvé pour ce projet');
    }

    const service = dto.serviceId
      ? await this.prisma.projectService.findFirst({
          where: { id: dto.serviceId, projectId: dto.projectId },
        })
      : null;

    if (dto.serviceId && !service) {
      throw new NotFoundException('Service non trouvé pour ce projet');
    }

    const serviceTarget = dto.serviceId ? environment.serviceTargets[0] : null;
    if (dto.serviceId && !serviceTarget) {
      throw new BadRequestException(
        'Aucune cible VPS configurée pour ce service dans cet environnement',
      );
    }
    const targetServer = serviceTarget?.server ?? environment.server;

    if (!targetServer) {
      throw new BadRequestException('Aucun serveur cible trouvé pour cet environnement');
    }

    if (!targetServer.isVerified) {
      throw new BadRequestException('Le serveur cible doit être vérifié');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
      select: { id: true, name: true, branch: true, repoUrl: true, nixpacksConfig: true, staticConfig: true, defaultBuildSource: true },
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    const buildSource = this.resolveBuildSource(dto, service, project.defaultBuildSource);
    const isLocalBuild = this.isLocalBuildSource(buildSource);

    // Barrier: the server must have been prepared at least once (SUCCEEDED).
    // A server can be SSH-validated (isVerified=true) without ever running
    // ServerPreparation — which installs Docker, Nixpacks and other tools.
    if (buildSource !== 'STATIC') {
      const lastPrep = await this.prisma.serverPreparation.findFirst({
        where: {
          serverId: targetServer.id,
          status: 'SUCCEEDED' as const,
        },
        orderBy: { finishedAt: 'desc' },
        select: { id: true, finishedAt: true },
      });
      if (!lastPrep) {
        throw new BadRequestException(
          'Le serveur cible n\'a jamais été préparé. Lancez une préparation (rôles Docker, Nixpacks…) depuis l\'onglet Servers avant de déployer.',
        );
      }
    }

    // Pre-flight tool validation (barrier "0 silent deploy failure"): the
    // required build tool must be confirmed INSTALLED on the target VPS BEFORE
    // any playbook runs — otherwise the deploy fails cryptically deep in Ansible.
    // For STATIC deployments, Docker is NOT required on the target VPS.
    if (buildSource !== 'STATIC') {
      const dockerTool = await this.prisma.serverInstalledTool.findFirst({
        where: {
          serverId: targetServer.id,
          toolKey: 'docker',
          status: 'INSTALLED',
        },
        select: { id: true },
      });
      if (!dockerTool) {
        throw new BadRequestException(
          "Docker n'est pas installé sur le serveur cible. Préparez le serveur via l'onglet Servers.",
        );
      }
    }
    // NIXPACKS_LOCAL builds also need the nixpacks binary on the VPS. Without
    // this guard the deploy proceeds and fails with "Nixpacks binary not found".
    if (buildSource === 'NIXPACKS_LOCAL') {
      const nixpacksTool = await this.prisma.serverInstalledTool.findFirst({
        where: {
          serverId: targetServer.id,
          toolKey: 'nixpacks',
          status: 'INSTALLED',
        },
        select: { id: true },
      });
      if (!nixpacksTool) {
        throw new BadRequestException(
          "Nixpacks n'est pas installé sur le serveur cible. Préparez le serveur (rôle Nixpacks) avant de déployer en build local Nixpacks, ou choisissez « Dockerfile — Local ».",
        );
      }
    }

    await this.envConfigsService.getMergedDecrypted(
      dto.projectId,
      dto.environmentId,
      actor.id,
      actor.role,
    );

    const branch = dto.branch ?? service?.defaultBranch ?? project.branch;
    const repositoryId =
      dto.repoId ??
      (service?.externalRepoId ? Number(service.externalRepoId) : undefined);

    let dockerImage: string;
    if (buildSource === 'EXTERNAL_IMAGE') {
      if (!dto.overrideImage) throw new Error('overrideImage est requis pour EXTERNAL_IMAGE');
      dockerImage = dto.overrideImage;
      this.logger.log(`[CreateDeployment] EXTERNAL_IMAGE: ${dockerImage}`);
    } else if (buildSource === 'DOCKER_COMPOSE') {
      dockerImage = `compose://${project.name}`;
      this.logger.log(`[CreateDeployment] DOCKER_COMPOSE sentinel: ${dockerImage}`);
    } else if (isLocalBuild) {
      dockerImage = `${project.name}:${branch || 'latest'}`;
      this.logger.log(`[CreateDeployment] LOCAL build (${buildSource}): ${dockerImage}`);
    } else {
      dockerImage = await this.dockerService.buildDockerImage({
        projectId: dto.projectId,
        projectName: service ? `${project.name}-${service.name}` : project.name,
        branch,
        serviceId: service?.id,
      });
    }

    // Stale recovery: mark any PENDING/RUNNING deployments for this environment
    // as FAILED if they've been stuck for more than 5 minutes (crash recovery).
    await this.recoverStaleDeployments(dto.environmentId);

    const resolvedNixpacksConfig =
      dto.nixpacksConfig ??
      service?.nixpacksConfig ??
      project.nixpacksConfig ??
      null;

    const resolvedStaticConfig =
      dto.staticConfig ??
      service?.staticConfig ??
      project.staticConfig ??
      null;

    let deployment = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('deploy_env:' || ${dto.environmentId})
        )
      `;

      const active = await tx.deployment.findFirst({
        where: {
          environmentId: dto.environmentId,
          status: { in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING] },
        },
        select: { id: true, status: true, createdAt: true },
      });
      if (active) {
        throw new BadRequestException(
          `Un déploiement est déjà en cours sur cet environnement ` +
          `(ID: ${active.id}, statut: ${active.status}). ` +
          `Attendez la fin du déploiement actuel avant d'en lancer un nouveau.`,
        );
      }

      // P2-#1: every new deployment gets a Build row. Created in the same
      // transaction so the deployment is never created without its build
      // (all-or-nothing). Legacy fields (buildStrategy, nixpacksConfig…)
      // stay populated on the Deployment for backward compat — they are
      // duplicated values, the source of truth is now the Build row.
      const build = await this.buildsService.create({
        projectId: dto.projectId,
        serviceId: service?.id ?? null,
        userId: actor.id,
        branch,
        buildPack: this.buildSourceToBuildPack(buildSource),
        isLocalBuild,
        nixpacksConfig: resolvedNixpacksConfig as Prisma.InputJsonValue | null,
        staticConfig: resolvedStaticConfig as Prisma.InputJsonValue | null,
      }, tx);

      // Immutable Release: freeze the desired state + the concrete bindings.
      // `specSnapshot` = what was desired (source/build), `resolvedRefs` = what
      // it was bound to (server/environment). These make the deployment an
      // immutable revision usable for exact rollback, audit and diff.
      const specSnapshot = {
        capturedAt: new Date().toISOString(),
        source: {
          branch,
          serviceId: service?.id ?? null,
          repoUrl: project.repoUrl ?? null,
        },
        build: {
          buildSource,
          isLocalBuild,
          strategy:
            dto.strategy === 'blue-green' ? 'BLUE_GREEN' : 'STANDARD',
          nixpacksConfig: resolvedNixpacksConfig ?? null,
          staticConfig: resolvedStaticConfig ?? null,
        },
      };
      const resolvedRefs = {
        projectId: dto.projectId,
        environmentId: dto.environmentId,
        serverId: serviceTarget?.serverId ?? null,
      };

      return tx.deployment.create({
        data: {
          projectId: dto.projectId,
          serviceId: service?.id,
          environmentId: dto.environmentId,
          userId: actor.id,
          branch,
          status: DeploymentStatus.PENDING,
          startedAt: new Date(),
          strategy: dto.strategy === 'blue-green'
            ? DeploymentStrategy.BLUE_GREEN
            : DeploymentStrategy.STANDARD,
          buildId: build.id,
          specSnapshot: specSnapshot as unknown as Prisma.InputJsonValue,
          resolvedRefs: resolvedRefs as unknown as Prisma.InputJsonValue,
          ...(resolvedNixpacksConfig
            ? {
                nixpacksConfig:
                  resolvedNixpacksConfig as unknown as Prisma.InputJsonValue,
              }
            : {}),
          ...(resolvedStaticConfig
            ? {
                staticConfig:
                  resolvedStaticConfig as unknown as Prisma.InputJsonValue,
              }
            : {}),
        },
      });
    });

    this.auditService.record(actor.id, 'DEPLOYMENT_CREATE', 'Deployment', deployment.id, {
      projectId: dto.projectId,
      environmentId: dto.environmentId,
      serviceId: service?.id,
      branch,
      buildSource,
      isLocalBuild,
    }).catch((err: unknown) => {
      this.logger.warn(`Audit record failed for deployment ${deployment.id}: ${err instanceof Error ? err.message : 'unknown error'}`);
    });

    this.gateway.emitStarted({
      deploymentId: deployment.id,
      projectId: deployment.projectId,
      environmentId: deployment.environmentId,
      status: deployment.status,
      startedAt: deployment.startedAt,
    });

    // Single source of truth for "should we skip GitLab CI and trigger the
    // playbook directly?". The router also picks the playbook; here we only
    // need the needsDirectTrigger flag.
    const route = this.buildStrategyResolver.resolve({
      buildSource,
      strategy: dto.strategy === 'blue-green'
        ? DeploymentStrategy.BLUE_GREEN
        : DeploymentStrategy.STANDARD,
      dockerImage,
    });

    if (route.needsDirectTrigger) {
      this.logger.log(
        `[CreateDeployment] Direct Ansible (${buildSource}) — ${route.reason}`,
      );
      deployment = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.RUNNING,
          logs: `Déploiement ${buildSource} lancé directement.`,
          dockerImage,
        },
      });
      this.gateway.emitStatus({
        deploymentId: deployment.id,
        status: deployment.status,
      });

      // CRITICAL: no GitLab pipeline means no webhook will fire, so we must
      // trigger the playbook ourselves. Fire-and-forget — the WebSocket
      // gateway streams progress to the user.
      void this.ansibleService
        .deployWithAnsible(deployment.id, undefined)
        .catch((err: unknown) => {
          const reason =
            err instanceof Error ? err.message : 'erreur inconnue';
          this.logger.error(
            `[CreateDeployment] Direct ansible deploy failed for ${deployment.id}: ${reason}`,
          );
        });
      return deployment;
    }

    let pipeline: PipelineItem;
    try {
      pipeline = await this.gitProvidersService.triggerPipeline(
        dto.projectId,
        branch,
        actor.id,
        actor.role,
        repositoryId,
      );
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : 'Échec du déclenchement du pipeline CI';

      const failed = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.FAILED,
          finishedAt: new Date(),
          logs: `${deployment.logs ?? ''}\n${reason}`.trim(),
        },
      });

      this.gateway.emitStatus({
        deploymentId: failed.id,
        status: failed.status,
      });
      this.gateway.emitFinished({
        deploymentId: failed.id,
        status: failed.status,
        finishedAt: failed.finishedAt,
      });

      throw error;
    }

    const pipelineIdBigInt = BigInt(pipeline.id);
    const providerType = await this.gitProvidersService.resolveProviderType(dto.projectId);

    await this.prisma.pipelineRun.upsert({
      where: { externalId_provider: { externalId: pipelineIdBigInt, provider: providerType } },
      create: {
        externalId: pipelineIdBigInt,
        provider: providerType,
        status: 'RUNNING',
        branch,
        webUrl: pipeline.webUrl,
        projectId: dto.projectId,
        serviceId: service?.id ?? null,
        deploymentId: deployment.id,
      },
      update: { deploymentId: deployment.id, status: 'RUNNING', webUrl: pipeline.webUrl },
    });

    deployment = await this.prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: DeploymentStatus.RUNNING,
        logs: `Déploiement lancé. Pipeline #${String(pipeline.id)}.`,
        externalPipelineId: pipelineIdBigInt,
        dockerImage,
      },
    });

    this.gateway.emitStatus({
      deploymentId: deployment.id,
      status: deployment.status,
    });

    return deployment;
  }

  private async recoverStaleDeployments(environmentId: string): Promise<void> {
    const staleTimeout = new Date(Date.now() - 5 * 60 * 1000);
    await this.prisma.deployment.updateMany({
      where: {
        environmentId,
        status: { in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING] },
        startedAt: { lt: staleTimeout },
      },
      data: {
        status: DeploymentStatus.FAILED,
        finishedAt: new Date(),
        conditions: { type: 'Degraded', reason: 'StaleRecovery', message: 'Déploiement récupéré après un crash du service.' } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private resolveBuildSource(
    dto: CreateDeploymentDto,
    service: { buildPack: BuildPack } | null,
    projectDefaultBuildSource?: string | null,
  ): BuildSource {
    if (dto.buildSource) return dto.buildSource;
    if (dto.overrideImage) return 'EXTERNAL_IMAGE';
    // Use project defaultBuildSource as first fallback (set in Configuration tab)
    if (projectDefaultBuildSource) {
      return projectDefaultBuildSource as BuildSource;
    }
    // Fallback from legacy service.buildPack
    const pack = service?.buildPack;
    if (pack === BuildPack.STATIC) return 'STATIC';
    if (pack === BuildPack.DOCKER_COMPOSE) return 'DOCKER_COMPOSE';
    if (pack === BuildPack.NIXPACKS) return 'NIXPACKS_LOCAL';
    return 'DOCKERFILE_REGISTRY';
  }

  private isLocalBuildSource(src: BuildSource): boolean {
    return (
      src === 'DOCKERFILE_LOCAL' ||
      src === 'NIXPACKS_LOCAL' ||
      src === 'STATIC' ||
      src === 'DOCKER_COMPOSE'
    );
  }

  private buildSourceToBuildPack(src: BuildSource): BuildPack {
    if (src === 'DOCKERFILE_REGISTRY' || src === 'DOCKERFILE_LOCAL') return BuildPack.DOCKERFILE;
    if (src === 'NIXPACKS_REGISTRY' || src === 'NIXPACKS_LOCAL') return BuildPack.NIXPACKS;
    if (src === 'DOCKER_COMPOSE') return BuildPack.DOCKER_COMPOSE;
    if (src === 'STATIC') return BuildPack.STATIC;
    return BuildPack.NONE;
  }

}
