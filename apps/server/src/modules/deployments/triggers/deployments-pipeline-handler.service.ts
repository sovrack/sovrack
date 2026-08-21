import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  DeploymentStatus,
  GitProviderType,
  PipelineRunStatus,
} from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import {
  DEPLOYMENT_PIPELINE_UPDATED,
  type PipelineUpdatedEvent,
} from '../events/deployment.events';
import { QueueService } from '../../../shared/queue/queue.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  deploymentRelationsInclude,
  type DeploymentWithRelations,
} from '../query/deployments-query.service';

/**
 * Handles inbound pipeline status updates from webhooks (GitLab, GitHub).
 *
 * Single responsibility:
 *   1. Find the correlated in-flight Deployment.
 *   2. Upsert a PipelineRun record (replaces fragile log-based markers).
 *   3. On SUCCESS  → trigger Ansible playbook.
 *   4. On FAILED/CANCELED → mark the Deployment terminal + emit events.
 */
@Injectable()
export class DeploymentsPipelineHandlerService {
  private readonly logger = new Logger(DeploymentsPipelineHandlerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly gateway: DeploymentEventsPublisher,
    private readonly notificationsService: NotificationsService,
  ) {}

  @OnEvent(DEPLOYMENT_PIPELINE_UPDATED)
  async onPipelineUpdated(event: PipelineUpdatedEvent): Promise<void> {
    await this.handlePipelineUpdate(
      event.projectId,
      event.pipelineId,
      event.webhookStatus,
      event.image,
      event.provider ?? GitProviderType.GITLAB,
    );
  }

  async handlePipelineUpdate(
    projectId: string,
    pipelineId: number,
    status: string,
    image?: string,
    provider: GitProviderType = GitProviderType.GITLAB,
  ): Promise<{ status: 'ok' | 'ignored' }> {
    const externalId = BigInt(pipelineId);
    const pipelineRunStatus = this.toPipelineRunStatus(status);
    const deploymentStatus = this.toDeploymentStatus(status);

    // ── 1. Find correlated deployment ────────────────────────────────────────
    //    Primary:   PipelineRun already links to a Deployment
    //    Secondary: Legacy Deployment.gitlabPipelineId field
    const existingRun = await this.prisma.pipelineRun
      .findUnique({
        where: {
          projectId_externalId_provider: { projectId, externalId, provider },
        },
        select: { id: true, deploymentId: true, projectId: true },
      })
      .catch(() => null);

    const deployment = await this.findDeployment(
      externalId,
      existingRun?.deploymentId,
      projectId,
    );
    if (!deployment) return { status: 'ignored' };

    // ── 2. Upsert PipelineRun (now we have projectId from deployment) ─────────
    await this.prisma.pipelineRun
      .upsert({
        where: {
          projectId_externalId_provider: { projectId, externalId, provider },
        },
        create: {
          externalId,
          provider,
          status: pipelineRunStatus,
          imageSha: image ?? null,
          deploymentId: deployment.id,
          projectId,
        },
        update: {
          status: pipelineRunStatus,
          imageSha: image ?? undefined,
          deploymentId: deployment.id,
        },
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `[PipelineHandler] PipelineRun upsert failed for pipeline ${String(pipelineId)}: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      });

    // ── 3. Act on terminal / success status ───────────────────────────────────
    if (deploymentStatus === DeploymentStatus.SUCCESS) {
      const claimed = await this.prisma.deployment.updateMany({
        where: {
          id: deployment.id,
          status: { in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING] },
        },
        data: {
          status: DeploymentStatus.RUNNING,
          externalPipelineId: externalId,
          logs: `${deployment.logs ?? ''}\nPipeline #${String(pipelineId)}: ${status}`.trim(),
        },
      });
      if (claimed.count === 0) return { status: 'ignored' };
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { teamId: true },
      });
      if (!project) return { status: 'ignored' };
      try {
        await this.queueService.enqueueDeploy(
          deployment.id,
          project.teamId,
          image,
        );
      } catch (error) {
        await this.prisma.deployment.updateMany({
          where: { id: deployment.id, status: DeploymentStatus.RUNNING },
          data: { status: DeploymentStatus.PENDING },
        });
        throw error;
      }
      return { status: 'ok' };
    }

    if (
      deploymentStatus === DeploymentStatus.FAILED ||
      deploymentStatus === DeploymentStatus.CANCELED
    ) {
      const finalized = await this.prisma.deployment.updateMany({
        where: {
          id: deployment.id,
          status: { in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING] },
        },
        data: {
          status: deploymentStatus,
          finishedAt: new Date(),
          externalPipelineId: externalId,
          logs: `${deployment.logs ?? ''}\nPipeline #${String(pipelineId)}: ${status}`.trim(),
        },
      });
      if (finalized.count === 0) return { status: 'ignored' };

      const updated = await this.prisma.deployment.findUnique({
        where: { id: deployment.id },
        select: { id: true, status: true, finishedAt: true },
      });
      if (!updated) return { status: 'ignored' };

      this.gateway.emitStatus({
        deploymentId: updated.id,
        status: updated.status,
      });
      this.gateway.emitFinished({
        deploymentId: updated.id,
        status: updated.status,
        finishedAt: updated.finishedAt,
      });

      const full = await this.prisma.deployment.findUnique({
        where: { id: updated.id },
        include: deploymentRelationsInclude,
      });
      if (full) this.sendNotification(full);
    }

    return { status: 'ok' };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async findDeployment(
    externalId: bigint,
    linkedDeploymentId: string | null | undefined,
    projectId: string,
  ) {
    if (linkedDeploymentId) {
      return this.prisma.deployment.findFirst({
        where: { id: linkedDeploymentId, projectId },
        select: { id: true, status: true, logs: true, projectId: true },
      });
    }
    return this.prisma.deployment.findFirst({
      where: {
        projectId,
        status: { in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING] },
        externalPipelineId: externalId,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, logs: true, projectId: true },
    });
  }

  private toPipelineRunStatus(status: string): PipelineRunStatus {
    switch (status.toLowerCase()) {
      case 'success':
        return PipelineRunStatus.SUCCESS;
      case 'failed':
        return PipelineRunStatus.FAILED;
      case 'canceled':
      case 'cancelled':
        return PipelineRunStatus.CANCELED;
      case 'running':
        return PipelineRunStatus.RUNNING;
      case 'ignored':
        return PipelineRunStatus.IGNORED;
      default:
        return PipelineRunStatus.PENDING;
    }
  }

  private toDeploymentStatus(status: string): DeploymentStatus {
    switch (status.toLowerCase()) {
      case 'success':
        return DeploymentStatus.SUCCESS;
      case 'failed':
        return DeploymentStatus.FAILED;
      case 'canceled':
      case 'cancelled':
        return DeploymentStatus.CANCELED;
      case 'running':
        return DeploymentStatus.RUNNING;
      default:
        return DeploymentStatus.PENDING;
    }
  }

  private sendNotification(deployment: DeploymentWithRelations): void {
    void this.notificationsService.notifyDeploymentFinished({
      deploymentId: deployment.id,
      status: deployment.status as 'SUCCESS' | 'FAILED' | 'CANCELED',
      projectName: deployment.project.name,
      environmentName: deployment.environment.name,
      branch: deployment.branch,
      triggeredBy: deployment.user?.fullName ?? 'Système',
      pipelineUrl: deployment.externalPipelineId
        ? `${deployment.service?.provider?.providerUrl ?? ''}/${deployment.service?.repoPath ?? ''}/-/pipelines/${String(deployment.externalPipelineId)}`
        : null,
    });
  }
}
