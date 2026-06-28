import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DeploymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { DockerDeployExecutorService } from '../core/docker-deploy-executor.service';

/** Container states that mean the desired RUNNING state has drifted. */
const DEAD_STATES = new Set(['exited', 'dead']);
/** Don't re-heal a service-env that was auto-healed less than this ago (anti-storm). */
const HEAL_COOLDOWN_MS = 5 * 60_000;

/**
 * Declarative reconciler (self-healing). Every minute it compares the DESIRED
 * state (latest SUCCESS Deployment of each active ServiceEnvironment = a running
 * container) with the OBSERVED state (Docker API). On drift (container exited or
 * dead), it records a Degraded condition and creates an auto-heal Deployment that
 * re-pulls the same immutable image and recreates the container, then notifies.
 *
 * This is the loop that turns the deploy tool into a platform: a container that
 * crashes at 3am is brought back without anyone noticing.
 */
@Injectable()
export class ReconcilerService {
  private readonly logger = new Logger(ReconcilerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dockerApi: DockerApiService,
    private readonly deployExecutor: DockerDeployExecutorService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('*/1 * * * *', { name: 'deployment-reconciler' })
  async reconcile(): Promise<void> {
    const serviceEnvs = await this.prisma.serviceEnvironment.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        serviceId: true,
        environmentId: true,
        service: { select: { projectId: true } },
        deployments: {
          where: { status: DeploymentStatus.SUCCESS },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            branch: true,
            specSnapshot: true,
            resolvedRefs: true,
            dockerImage: true,
            imageSha: true,
            isAutoHealed: true,
            createdAt: true,
            containers: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { id: true, dockerId: true, name: true },
            },
          },
        },
      },
    });

    for (const env of serviceEnvs) {
      try {
        await this.reconcileOne(env);
      } catch (error) {
        this.logger.warn(
          `Reconcile failed for serviceEnv ${env.id}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }
  }

  private async reconcileOne(env: {
    id: string;
    serviceId: string;
    environmentId: string;
    service: { projectId: string };
    deployments: Array<{
      id: string;
      branch: string;
      specSnapshot: Prisma.JsonValue;
      resolvedRefs: Prisma.JsonValue;
      dockerImage: string | null;
      imageSha: string | null;
      isAutoHealed: boolean;
      createdAt: Date;
      containers: Array<{ id: string; dockerId: string; name: string }>;
    }>;
  }): Promise<void> {
    const last = env.deployments[0];
    const container = last?.containers[0];
    if (!last || !container) {
      return; // nothing deployed yet → nothing to reconcile
    }

    // Anti-storm: skip if we just auto-healed this env.
    if (
      last.isAutoHealed &&
      Date.now() - last.createdAt.getTime() < HEAL_COOLDOWN_MS
    ) {
      return;
    }

    const serverId = (last.resolvedRefs as { serverId?: string } | null)
      ?.serverId;
    if (!serverId) {
      return; // no resolved server (legacy row) → cannot inspect
    }

    // Skip if a deployment is already in flight for this service-env.
    const activeCount = await this.prisma.deployment.count({
      where: {
        serviceEnvId: env.id,
        status: { in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING] },
      },
    });
    if (activeCount > 0) {
      return;
    }

    const inspect = await this.dockerApi.inspectContainer(
      serverId,
      container.dockerId,
    );
    const status = inspect.State?.Status ?? 'unknown';
    if (!DEAD_STATES.has(status)) {
      return; // observed == desired (running) → nothing to do
    }

    this.logger.warn(
      `[Reconciler] Container ${container.name} is ${status} on server ${serverId} — auto-healing`,
    );

    // Record the drift on the (previously SUCCESS) deployment.
    await this.prisma.deployment.update({
      where: { id: last.id },
      data: {
        conditions: [
          {
            type: 'Ready',
            status: 'False',
            reason: 'ContainerCrashed',
            message: `Container observed ${status}; reconciler is recreating it.`,
            lastTransitionAt: new Date().toISOString(),
          },
        ] as unknown as Prisma.InputJsonValue,
      },
    });

    // Create an auto-heal Deployment that reuses the frozen spec + immutable image.
    const heal = await this.prisma.deployment.create({
      data: {
        projectId: env.service.projectId,
        serviceId: env.serviceId,
        serviceEnvId: env.id,
        environmentId: env.environmentId,
        branch: last.branch,
        status: DeploymentStatus.PENDING,
        startedAt: new Date(),
        specSnapshot: (last.specSnapshot ??
          Prisma.JsonNull) as Prisma.InputJsonValue,
        resolvedRefs: (last.resolvedRefs ??
          Prisma.JsonNull) as Prisma.InputJsonValue,
        dockerImage: last.dockerImage,
        imageSha: last.imageSha,
        isAutoHealed: true,
        autoHealReason: `container_${status}`,
        previousDeploymentId: last.id,
      },
      select: { id: true },
    });

    // Re-pull the immutable image and recreate the container.
    void this.deployExecutor
      .executeDeploy(heal.id, last.imageSha ?? last.dockerImage ?? undefined)
      .catch((err: unknown) =>
        this.logger.error(
          `[Reconciler] Auto-heal deploy ${heal.id} failed: ${err instanceof Error ? err.message : 'unknown'}`,
        ),
      );

    await this.notifications
      .notifyAutoHeal({
        serviceEnvId: env.id,
        containerName: container.name,
        reason: `Container observed ${status}`,
      })
      .catch(() => undefined);
  }
}
