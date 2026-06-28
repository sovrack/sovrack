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
  ManagedServiceType,
  Prisma,
  ServiceType,
} from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CreateDeploymentDto } from '../dto/create-deployment.dto';
import { DeploymentsConfigResolver } from '../query/deployments-config-resolver.service';
import { DeploymentsAuthorizationService } from '../query/deployments-authorization.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';
import { DockerDeployExecutorService } from './docker-deploy-executor.service';
import { SourceProvidersService } from '../../source-providers/source-providers.service';
import type { PipelineItem } from '../../source-providers/contracts/git-provider.contract';
import { BuildLifecycleService } from '../../build/lifecycle/build-lifecycle.service';
import { BuildStrategyResolver } from '../../build/strategies/build-strategy.resolver';
import { AuditService } from '../../audit/audit.service';
import { QueueService } from '../../../shared/queue/queue.service';

@Injectable()
export class DeploymentsCreateService {
  private readonly logger = new Logger(DeploymentsCreateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gitProvidersService: SourceProvidersService,
    private readonly gateway: DeploymentEventsPublisher,
    private readonly configResolver: DeploymentsConfigResolver,
    private readonly authorizationService: DeploymentsAuthorizationService,
    private readonly dockerDeployExecutor: DockerDeployExecutorService,
    private readonly buildsService: BuildLifecycleService,
    private readonly buildStrategyResolver: BuildStrategyResolver,
    private readonly auditService: AuditService,
    private readonly queueService: QueueService,
  ) {}

  async create(dto: CreateDeploymentDto, userId: string): Promise<Deployment> {
    const actor = await this.authorizationService.getActor(userId);

    const serviceEnv = await this.prisma.serviceEnvironment.findUnique({
      where: { id: dto.serviceEnvId },
      include: {
        service: true,
        environment: {
          include: {
            project: {
              select: { id: true, name: true, maxConcurrentDeploys: true },
            },
            servers: {
              where: { isActive: true, isVerified: true },
              take: 1,
              select: {
                id: true,
                name: true,
                host: true,
                port: true,
                username: true,
              },
            },
          },
        },
      },
    });

    if (!serviceEnv) {
      throw new NotFoundException('Lien service-environnement non trouvé');
    }

    const { service, environment } = serviceEnv;
    const project = environment.project;

    await this.authorizationService.assertCanDeployProject(
      project.id,
      actor.id,
      actor.role,
    );

    await this.authorizationService.assertCanDeployToEnvironment(
      project.id,
      environment.id,
      actor.id,
      actor.role,
    );

    if (service.type === ServiceType.DATABASE) {
      return this.createDatabaseDeployment(
        dto,
        actor,
        service,
        serviceEnv,
        environment,
      );
    }

    const config = await this.configResolver.resolve(dto, service, project);
    const {
      buildSource,
      isLocalBuild,
      branch,
      dockerImage,
      resolvedNixpacksConfig,
      resolvedStaticConfig,
    } = config;
    const server = environment.servers[0] ?? null;

    let deployment = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('deploy_env:' || ${serviceEnv.id})
        )
      `;

      const staleTimeout = new Date(Date.now() - 45 * 60 * 1000); // aligné build timeout (30min) + cron 45min : ne pas tuer un build long légitime
      await tx.deployment.updateMany({
        where: {
          serviceEnvId: serviceEnv.id,
          status: { in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING] },
          startedAt: { lt: staleTimeout },
        },
        data: {
          status: DeploymentStatus.FAILED,
          finishedAt: new Date(),
          conditions: {
            type: 'Degraded',
            reason: 'StaleRecovery',
            message: 'Déploiement récupéré après un crash du service.',
          } as unknown as Prisma.InputJsonValue,
        },
      });

      const active = await tx.deployment.findFirst({
        where: {
          serviceEnvId: serviceEnv.id,
          status: { in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING] },
        },
        select: { id: true, status: true, createdAt: true },
      });
      if (active) {
        throw new BadRequestException(
          `Un déploiement est déjà en cours pour ce service sur cet environnement ` +
            `(ID: ${active.id}, statut: ${active.status}).`,
        );
      }

      // Multi-tenant fair-share: enforce the project-wide concurrent-deploy cap
      // (if configured) so one project can't saturate the shared deploy workers.
      const maxConcurrent = project.maxConcurrentDeploys;
      if (maxConcurrent && maxConcurrent > 0) {
        const inFlight = await tx.deployment.count({
          where: {
            projectId: project.id,
            status: {
              in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING],
            },
          },
        });
        if (inFlight >= maxConcurrent) {
          throw new BadRequestException(
            `Limite de déploiements simultanés atteinte pour ce projet ` +
              `(${inFlight}/${maxConcurrent}). Réessayez quand un déploiement en cours sera terminé.`,
          );
        }
      }

      const build = await this.buildsService.create(
        {
          projectId: project.id,
          serviceId: service.id,
          serviceEnvId: serviceEnv.id,
          userId: actor.id,
          branch,
          buildPack: this.configResolver.buildSourceToBuildPack(buildSource),
          isLocalBuild,
          nixpacksConfig: resolvedNixpacksConfig,
          staticConfig: resolvedStaticConfig,
        },
        tx,
      );

      // Immutable Release : on gèle TOUTE la config de build au moment du deploy
      // (reproductibilité + audit). Lu par le reconciler ; sera la source unique
      // de l'executor en P2 (bascule runtime). Étape additive, sans migration.
      const specSnapshot = {
        capturedAt: new Date().toISOString(),
        repoPath: service.repoPath ?? null,
        branch,
        buildSource,
        isLocalBuild,
        buildPack: this.configResolver.buildSourceToBuildPack(buildSource),
        dockerfile: service.dockerfile ?? null,
        rootDir: service.rootDir ?? null,
        port: service.port ?? null,
        startCommand: service.startCommand ?? null,
        healthcheckPath: service.healthcheckPath ?? null,
        strategy: dto.strategy === 'blue-green' ? 'BLUE_GREEN' : 'STANDARD',
        nixpacksConfig: resolvedNixpacksConfig ?? null,
        staticConfig: resolvedStaticConfig ?? null,
      };
      const resolvedRefs = { serverId: server?.id ?? null };

      return tx.deployment.create({
        data: {
          projectId: project.id,
          serviceId: service.id,
          serviceEnvId: serviceEnv.id,
          environmentId: environment.id,
          userId: actor.id,
          branch,
          status: DeploymentStatus.PENDING,
          startedAt: new Date(),
          strategy:
            dto.strategy === 'blue-green'
              ? DeploymentStrategy.BLUE_GREEN
              : DeploymentStrategy.STANDARD,
          buildId: build.id,
          specSnapshot: specSnapshot as unknown as Prisma.InputJsonValue,
          resolvedRefs: resolvedRefs as unknown as Prisma.InputJsonValue,
          observedGeneration: serviceEnv.generation,
        },
      });
    });

    this.auditService
      .record(actor.id, 'DEPLOYMENT_CREATE', 'Deployment', deployment.id, {
        projectId: project.id,
        environmentId: environment.id,
        serviceId: service.id,
        serviceEnvId: serviceEnv.id,
        branch,
        buildSource,
        isLocalBuild,
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `Audit record failed for deployment ${deployment.id}: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      });

    this.gateway.emitStarted({
      deploymentId: deployment.id,
      projectId: deployment.projectId,
      environmentId: deployment.environmentId,
      status: deployment.status,
      startedAt: deployment.startedAt,
    });

    const route = this.buildStrategyResolver.resolve({
      buildSource,
      strategy:
        dto.strategy === 'blue-green'
          ? DeploymentStrategy.BLUE_GREEN
          : DeploymentStrategy.STANDARD,
      dockerImage,
    });

    if (route.needsDirectTrigger) {
      this.logger.log(
        `[CreateDeployment] Direct deploy (${buildSource}) — ${route.reason}`,
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

      await this.queueService.enqueueDeploy(deployment.id);
      return deployment;
    }

    let pipeline: PipelineItem;
    try {
      pipeline = await this.gitProvidersService.triggerPipeline(
        project.id,
        branch,
        actor.id,
        actor.role,
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
    const providerType = await this.gitProvidersService.resolveProviderType(
      project.id,
    );

    await this.prisma.pipelineRun.upsert({
      where: {
        externalId_provider: {
          externalId: pipelineIdBigInt,
          provider: providerType,
        },
      },
      create: {
        externalId: pipelineIdBigInt,
        provider: providerType,
        status: 'RUNNING',
        branch,
        webUrl: pipeline.webUrl,
        projectId: project.id,
        serviceEnvId: serviceEnv.id,
        deploymentId: deployment.id,
      },
      update: {
        deploymentId: deployment.id,
        status: 'RUNNING',
        webUrl: pipeline.webUrl,
      },
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

  private async createDatabaseDeployment(
    dto: CreateDeploymentDto,
    actor: { id: string; role: string },
    service: {
      id: string;
      name: string;
      databaseType: ManagedServiceType | null;
      databaseVersion: string | null;
      databaseCredentials: Prisma.JsonValue | null;
    },
    serviceEnv: { id: string },
    environment: {
      id: string;
      project: { id: string; name: string };
      servers: { id: string }[];
    },
  ): Promise<Deployment> {
    if (!service.databaseType) {
      throw new BadRequestException(
        'databaseType est requis pour un service DATABASE',
      );
    }

    const project = environment.project;
    const dbConfig = this.configResolver.getDatabaseImage(service);
    const server = environment.servers[0] ?? null;

    const deployment = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext('deploy_env:' || ${serviceEnv.id}))
      `;

      const staleTimeout = new Date(Date.now() - 45 * 60 * 1000); // aligné build timeout (30min) + cron 45min : ne pas tuer un build long légitime
      await tx.deployment.updateMany({
        where: {
          serviceEnvId: serviceEnv.id,
          status: { in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING] },
          startedAt: { lt: staleTimeout },
        },
        data: {
          status: DeploymentStatus.FAILED,
          finishedAt: new Date(),
          conditions: {
            type: 'Degraded',
            reason: 'StaleRecovery',
            message: 'Déploiement récupéré après un crash du service.',
          } as unknown as Prisma.InputJsonValue,
        },
      });

      const active = await tx.deployment.findFirst({
        where: {
          serviceEnvId: serviceEnv.id,
          status: { in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING] },
        },
        select: { id: true, status: true, createdAt: true },
      });
      if (active) {
        throw new BadRequestException(
          `Un déploiement est déjà en cours (ID: ${active.id}, statut: ${active.status}).`,
        );
      }

      const specSnapshot = {
        capturedAt: new Date().toISOString(),
        buildSource: 'EXTERNAL_IMAGE',
        isLocalBuild: false,
        strategy: 'STANDARD',
        databaseType: service.databaseType,
        databaseVersion: service.databaseVersion,
        databaseImage: dbConfig.image,
      };

      return tx.deployment.create({
        data: {
          projectId: project.id,
          serviceId: service.id,
          serviceEnvId: serviceEnv.id,
          environmentId: environment.id,
          userId: actor.id,
          branch: dto.branch ?? 'main',
          status: DeploymentStatus.PENDING,
          startedAt: new Date(),
          strategy: DeploymentStrategy.STANDARD,
          dockerImage: dbConfig.image,
          specSnapshot: specSnapshot as unknown as Prisma.InputJsonValue,
          resolvedRefs: {
            serverId: server?.id ?? null,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });

    this.auditService
      .record(actor.id, 'DEPLOYMENT_CREATE', 'Deployment', deployment.id, {
        projectId: project.id,
        environmentId: environment.id,
        serviceId: service.id,
        serviceEnvId: serviceEnv.id,
        buildSource: 'EXTERNAL_IMAGE',
        databaseType: service.databaseType,
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `Audit record failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      });

    this.gateway.emitStarted({
      deploymentId: deployment.id,
      projectId: deployment.projectId,
      environmentId: deployment.environmentId,
      status: deployment.status,
      startedAt: deployment.startedAt,
    });

    const updated = await this.prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: DeploymentStatus.RUNNING,
        logs: 'Déploiement base de données lancé directement.',
        dockerImage: dbConfig.image,
      },
    });

    this.gateway.emitStatus({
      deploymentId: updated.id,
      status: updated.status,
    });

    await this.queueService.enqueueDeploy(updated.id);

    return updated;
  }
}
