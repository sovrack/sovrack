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

/** Shape of a serviceEnvironment row as selected in triggerAutoDeployIfConfigured. */
type MatchingServiceEnv = Pick<
  ServiceEnvironment,
  'id' | 'serviceId' | 'environmentId' | 'buildPack'
> & {
  service: {
    buildPack: BuildPack | null;
    nixpacksConfig: Prisma.JsonValue;
    staticConfig: Prisma.JsonValue;
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
        service: {
          select: { buildPack: true, nixpacksConfig: true, staticConfig: true },
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

      // Concurrency guard: never start a second deploy for a service-env that
      // already has one in flight (race on same container/host port).
      const inFlight = await this.prisma.deployment.findFirst({
        where: {
          serviceEnvId: svcEnv.id,
          status: { in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING] },
        },
        select: { id: true },
      });
      if (inFlight) {
        this.logger.warn(
          `Auto-deploy skipped for serviceEnv ${svcEnv.id}: deployment ${inFlight.id} already in flight.`,
        );
        return;
      }

      // Project-level concurrency guard.
      const maxConcurrent = svcEnv.environment.project?.maxConcurrentDeploys;
      if (maxConcurrent && maxConcurrent > 0) {
        const projectInFlight = await this.prisma.deployment.count({
          where: {
            projectId,
            status: {
              in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING],
            },
          },
        });
        if (projectInFlight >= maxConcurrent) {
          this.logger.warn(
            `Auto-deploy skipped for serviceEnv ${svcEnv.id}: project concurrent deploy limit reached (${projectInFlight}/${maxConcurrent}).`,
          );
          return;
        }
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

      const deployment = await this.prisma.$transaction(async (tx) => {
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
