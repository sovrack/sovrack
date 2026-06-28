import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  DeploymentStatus,
  BuildPack,
  Prisma,
  BuildTrigger,
  BuildStatus,
} from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { QueueService } from '../../../shared/queue/queue.service';
import { BuildLifecycleService } from '../../build/lifecycle/build-lifecycle.service';
import {
  DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
  type AutoDeployTriggerEvent,
} from '../events/deployment.events';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';

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
        environment: { select: { id: true, isProtected: true, name: true } },
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

    for (const svcEnv of matchingServiceEnvs) {
      try {
        // Authorization parity with the manual path: a webhook/pipeline trigger
        // is a SYSTEM action with no privileged actor, so it must NOT deploy to
        // a protected environment (which requires platform ADMIN or project
        // OWNER — see DeploymentsAuthorizationService.assertCanDeployToEnvironment).
        // Auto-deploying here would bypass that gate.
        if (svcEnv.environment.isProtected) {
          this.logger.warn(
            `Auto-deploy skipped: environment "${svcEnv.environment.name}" is protected — ` +
              `webhook/pipeline triggers cannot deploy to it (ADMIN/OWNER manual deploy required).`,
          );
          continue;
        }

        // Deduplicate: skip if a deployment for this pipeline is already recorded.
        if (pipelineIdValue || autoDeployMarker) {
          const existing = await this.prisma.deployment.findFirst({
            where: {
              projectId,
              serviceEnvId: svcEnv.id,
              OR: [
                ...(pipelineIdValue
                  ? [{ externalPipelineId: pipelineIdValue }]
                  : []),
                ...(autoDeployMarker
                  ? [{ logs: { contains: autoDeployMarker } }]
                  : []),
              ],
            },
            select: { id: true },
          });
          if (existing) continue;
        }

        // Concurrency guard (parity with the manual path in DeploymentsCreate):
        // never start a second deploy for a service-env that already has one in
        // flight — otherwise a manual deploy + a webhook (or two webhooks) could
        // race on the same container/host port.
        const inFlight = await this.prisma.deployment.findFirst({
          where: {
            serviceEnvId: svcEnv.id,
            status: {
              in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING],
            },
          },
          select: { id: true },
        });
        if (inFlight) {
          this.logger.warn(
            `Auto-deploy skipped for serviceEnv ${svcEnv.id}: deployment ${inFlight.id} already in flight.`,
          );
          continue;
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

        // userId is null for system/webhook-triggered deployments.
        // The triggerSource is encoded in the log prefix for auditability.
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
              ...(pipelineIdValue
                ? { externalPipelineId: pipelineIdValue }
                : {}),
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

        // Route through BullMQ queue for retry, backoff, and observability
        // — same path as manual deployments.
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
}
