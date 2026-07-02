import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  DeploymentStatus,
  BuildPack,
  Prisma,
  BuildTrigger,
  BuildStatus,
  type ServiceEnvironment,
} from '@prisma/client';

import { PrismaService } from '../../../shared/database/prisma.service';
import { QueueService } from '../../../shared/queue/queue.service';
import { BuildLifecycleService } from '../../build/lifecycle/build-lifecycle.service';
import {
  DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
  type AutoDeployTriggerEvent,
} from '../events/deployment.events';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';
import {
  buildAppSpecSnapshot,
  buildComposeSpecSnapshot,
} from '../utils/spec-snapshot.util';
import { resolveBuildSource } from '../utils/build-source.util';
import { toJson } from '../../../shared/utils/prisma-json.util';
import { acquireDeploySlot } from '../utils/deploy-slot.util';
import { DeploymentPreflightService } from '../core/deployment-preflight.service';

/** Shape of a serviceEnvironment row as selected in triggerAutoDeployIfConfigured. */
type MatchingServiceEnv = Pick<
  ServiceEnvironment,
  | 'id'
  | 'serviceId'
  | 'environmentId'
  | 'buildPack'
  | 'port'
  | 'startCommand'
  | 'healthcheckPath'
  | 'replicas'
  | 'generation'
> & {
  service: {
    buildPack: BuildPack | null;
    buildMode: string | null;
    sourceType: string | null;
    nixpacksConfig: Prisma.JsonValue;
    staticConfig: Prisma.JsonValue;
    repoPath: string | null;
    dockerfile: string | null;
    rootDir: string | null;
    port: number | null;
    startCommand: string | null;
    healthcheckPath: string | null;
    replicas: number;
    cpuLimit: number | null;
    memLimitMb: number | null;
    buildArgs: Prisma.JsonValue;
    composeServiceName: string | null;
  };
  environment: {
    id: string;
    isProtected: boolean;
    name: string;
    project: { id: string; maxConcurrentDeploys: number | null } | null;
  };
};

/**
 * Handles automatic deployments triggered by a push event or pipeline success.
 *
 * Responsibility (single):
 *   Listen for DEPLOYMENT_AUTO_DEPLOY_TRIGGER events, find all environments
 *   with autoDeploy=true that match the branch, create a Deployment + Build
 *   record, and fire the Ansible playbook.
 *
 * The pipeline update logic (webhook SUCCESS → start deploy) lives in
 * DeploymentsPipelineHandlerService.
 */
@Injectable()
export class DeploymentsAutoTriggerService {
  private readonly logger = new Logger(DeploymentsAutoTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly gateway: DeploymentEventsPublisher,
    private readonly buildsService: BuildLifecycleService,
    private readonly preflight: DeploymentPreflightService,
  ) {}

  @OnEvent(DEPLOYMENT_AUTO_DEPLOY_TRIGGER)
  async onAutoDeployTrigger(event: AutoDeployTriggerEvent): Promise<void> {
    await this.triggerAutoDeployIfConfigured(
      event.projectId,
      event.branch,
      event.dockerImage,
      event.pipelineId,
      event.serviceId,
    );
  }

  async triggerAutoDeployIfConfigured(
    projectId: string,
    branch: string,
    dockerImage?: string,
    pipelineId?: number,
    serviceId?: string,
  ): Promise<void> {
    // Collect only the ServiceEnvironments that have autoDeploy=true and whose
    // autoBranch matches the incoming branch (null autoBranch = any branch).
    const matchingServiceEnvs = await this.prisma.serviceEnvironment.findMany({
      where: {
        autoDeploy: true,
        archivedAt: null,
        ...(serviceId ? { serviceId } : {}),
        OR: [{ autoBranch: branch }, { autoBranch: null }],
        environment: { projectId },
      },
      select: {
        id: true,
        serviceId: true,
        environmentId: true,
        buildPack: true,
        port: true,
        startCommand: true,
        healthcheckPath: true,
        replicas: true,
        generation: true,
        service: {
          select: {
            buildPack: true,
            buildMode: true,
            sourceType: true,
            nixpacksConfig: true,
            staticConfig: true,
            repoPath: true,
            dockerfile: true,
            rootDir: true,
            port: true,
            startCommand: true,
            healthcheckPath: true,
            replicas: true,
            cpuLimit: true,
            memLimitMb: true,
            buildArgs: true,
            composeServiceName: true,
          },
        },
        environment: {
          select: {
            id: true,
            isProtected: true,
            name: true,
            project: { select: { id: true, maxConcurrentDeploys: true } },
          },
        },
      },
    });

    if (matchingServiceEnvs.length === 0) {
      this.logger.debug(
        `Auto-deploy: no matching autoDeploy=true ServiceEnvironments for project ${projectId} branch ${branch}`,
      );
      return;
    }

    const pipelineIdValue = pipelineId ? BigInt(pipelineId) : null;
    const autoDeployMarker = pipelineId
      ? `[AUTO_DEPLOY_PIPELINE_ID:${String(pipelineId)}]`
      : null;

    // Process all matching service-environments in parallel.
    // Each slot is independent (different containers/ports), so there is no
    // ordering constraint between them. Promise.allSettled ensures one failure
    // does not block the others.
    await Promise.allSettled(
      matchingServiceEnvs.map((svcEnv) =>
        this.triggerOneServiceEnv(
          svcEnv,
          projectId,
          branch,
          dockerImage,
          pipelineIdValue,
          autoDeployMarker,
        ),
      ),
    );
  }

  private async triggerOneServiceEnv(
    svcEnv: MatchingServiceEnv,
    projectId: string,
    branch: string,
    dockerImage: string | undefined,
    pipelineIdValue: bigint | null,
    autoDeployMarker: string | null,
  ): Promise<void> {
    try {
      // Authorization parity: webhook/pipeline triggers cannot deploy to
      // protected environments (requires ADMIN/OWNER manual action).
      if (svcEnv.environment.isProtected) {
        this.logger.warn(
          `Auto-deploy skipped: environment "${svcEnv.environment.name}" is protected — ` +
            `webhook/pipeline triggers cannot deploy to it (ADMIN/OWNER manual deploy required).`,
        );
        return;
      }

      // Garde de pré-vol bloquante (voir AUDIT_VALIDATION_DEPLOIEMENT.md) —
      // même garde que le chemin API (DeploymentsCreateService), avant toute
      // écriture. Un webhook externe n'a personne à qui montrer une erreur
      // HTTP : on journalise clairement et on abandonne SANS créer de ligne
      // Deployment/Build — le déploiement n'a jamais dû démarrer, il ne doit
      // donc pas polluer l'historique comme s'il avait été tenté. Le
      // try/catch englobant (plus bas) empêche déjà toute exception ici
      // d'interrompre le traitement des AUTRES service-env de ce webhook
      // (Promise.allSettled) ou la réponse HTTP du webhook lui-même.
      try {
        await this.preflight.assertDeployable({
          serviceEnvId: svcEnv.id,
          branch,
          overrideImage: dockerImage,
        });
      } catch (err) {
        this.logger.warn(
          `[PREFLIGHT REJECTED] Auto-deploy refusé pour serviceEnv ${svcEnv.id} ` +
            `(branche ${branch}) : ${err instanceof Error ? err.message : 'raison inconnue'}`,
        );
        return;
      }

      // Deduplicate by externalPipelineId (indexed column) only.
      // The old logs.contains() fallback was a non-indexable full-table scan
      // and has been removed. The autoDeployMarker is still written to logs
      // for auditability but is no longer used as a dedup key.
      if (pipelineIdValue) {
        const existing = await this.prisma.deployment.findFirst({
          where: {
            projectId,
            serviceEnvId: svcEnv.id,
            externalPipelineId: pipelineIdValue,
          },
          select: { id: true },
        });
        if (existing) return;
      }

      // Resolve build config from ServiceEnvironment override or Service default.
      const resolvedBuildPack =
        svcEnv.buildPack ?? svcEnv.service.buildPack ?? BuildPack.DOCKERFILE;
      const nixpacksConfig = svcEnv.service
        .nixpacksConfig as Prisma.InputJsonValue | null;
      const staticConfig = svcEnv.service
        .staticConfig as Prisma.InputJsonValue | null;
      const isLocalBuild =
        resolvedBuildPack === BuildPack.STATIC ||
        resolvedBuildPack === BuildPack.DOCKER_COMPOSE ||
        resolvedBuildPack === BuildPack.NIXPACKS ||
        resolvedBuildPack === BuildPack.BUILDPACK;

      // Freeze the full spec at dispatch time so rollback/reconciler can use
      // the exact config that was active when this deploy was triggered.
      const buildSource = resolveBuildSource({
        buildPack: resolvedBuildPack,
        buildMode: svcEnv.service.buildMode,
        sourceType: svcEnv.service.sourceType,
      });
      const specSnapshot =
        buildSource === 'DOCKER_COMPOSE'
          ? buildComposeSpecSnapshot({
              composeServiceName: svcEnv.service.composeServiceName ?? null,
              port: svcEnv.port ?? svcEnv.service.port ?? null,
              replicas: svcEnv.replicas ?? svcEnv.service.replicas ?? 1,
            })
          : buildAppSpecSnapshot({
              service: svcEnv.service,
              serviceEnv: {
                port: svcEnv.port,
                startCommand: svcEnv.startCommand,
                healthcheckPath: svcEnv.healthcheckPath,
                replicas: svcEnv.replicas,
              },
              branch,
              buildSource,
              isLocalBuild,
              buildPack: resolvedBuildPack,
              strategy: 'STANDARD',
              nixpacksConfig,
              staticConfig,
            });

      const project = svcEnv.environment.project ?? {
        id: projectId,
        maxConcurrentDeploys: null,
      };

      const deployment = await this.prisma.$transaction(async (tx) => {
        // Atomic advisory lock + stale recovery + in-flight guard + project cap.
        // Replaces the racy out-of-transaction guards that were here before.
        await acquireDeploySlot(tx, svcEnv.id, project);

        const build = await this.buildsService.create(
          {
            projectId,
            serviceId: svcEnv.serviceId,
            serviceEnvId: svcEnv.id,
            userId: null,
            branch,
            buildPack: resolvedBuildPack,
            isLocalBuild,
            initialStatus: BuildStatus.BUILDING,
            triggeredBy: BuildTrigger.WEBHOOK,
            nixpacksConfig,
            staticConfig,
            externalPipelineId: pipelineIdValue ?? null,
          },
          tx,
        );

        return tx.deployment.create({
          data: {
            projectId,
            serviceId: svcEnv.serviceId,
            serviceEnvId: svcEnv.id,
            environmentId: svcEnv.environmentId,
            userId: null,
            branch,
            status: DeploymentStatus.PENDING,
            startedAt: new Date(),
            buildId: build.id,
            specSnapshot: toJson(specSnapshot),
            observedGeneration: svcEnv.generation,
            ...(pipelineIdValue ? { externalPipelineId: pipelineIdValue } : {}),
            ...(dockerImage ? { dockerImage } : {}),
            logs: [
              `[WEBHOOK] Auto-deploy triggered by push on branch ${branch}`,
              autoDeployMarker,
            ]
              .filter((e): e is string => Boolean(e))
              .join('\n'),
          },
        });
      });

      this.gateway.emitStarted({
        deploymentId: deployment.id,
        projectId: deployment.projectId,
        environmentId: deployment.environmentId,
        status: deployment.status,
        startedAt: deployment.startedAt,
      });

      await this.queueService.enqueueDeploy(deployment.id, dockerImage);
    } catch (error) {
      this.logger.error(
        `Auto-deploy failed for serviceEnv ${svcEnv.id}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
