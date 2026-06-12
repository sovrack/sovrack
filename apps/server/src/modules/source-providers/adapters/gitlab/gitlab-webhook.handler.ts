import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GitProviderType, PipelineRunStatus } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import { GitlabPipelineItem } from './gitlab.client';
import {
  DEPLOYMENT_PIPELINE_UPDATED,
  DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
  type PipelineUpdatedEvent,
  type AutoDeployTriggerEvent,
} from '../../../deployments/events/deployment.events';
import {
  IWebhookHandler,
  WebhookEndpointContext,
  WebhookHandleResult,
} from '../../../webhooks/interfaces/webhook-handler.interface';

export type GitlabWebhookPayload = {
  object_kind?: string;
  event_name?: string;
  group_id?: number;
  project_id?: number;
  project?: {
    id?: number;
    namespace_id?: number;
    path_with_namespace?: string;
    namespace?: {
      id?: number;
    };
  };
  object_attributes?: {
    id?: number;
    status?: string;
    ref?: string;
    sha?: string;
    url?: string;
    web_url?: string;
  };
};

/**
 * GitLab webhook reception handler. Plugged into the unified webhook
 * pipeline via the WEBHOOK_HANDLER registry (see {@link IWebhookHandler}).
 *
 * Identity comes exclusively from the resolved {@link WebhookEndpointContext}
 * (projectId + serviceEnvId) — never from the payload. The payload is only
 * read for *event data*: pipeline id, branch, commit, status. Renaming a
 * repo on the GitLab side therefore never affects routing.
 */
@Injectable()
export class GitlabWebhookHandler implements IWebhookHandler {
  private readonly logger = new Logger(GitlabWebhookHandler.name);
  readonly provider = GitProviderType.GITLAB;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Entry point invoked by the unified `POST /webhooks/incoming/:token`
   * controller. The endpoint is already resolved + active and the event
   * already recorded; we just process. `options.verified` is reserved for
   * future signature wiring.
   */
  async handleIncoming(
    endpoint: WebhookEndpointContext,
    rawPayload: Record<string, unknown>,
    options: { verified: boolean; signatureError?: string } = { verified: true },
  ): Promise<WebhookHandleResult> {
    if (!endpoint.isActive) {
      return { status: 'ignored' };
    }
    if (!options.verified) {
      this.logger.warn(
        `handleIncoming on endpoint ${endpoint.id} with invalid signature: ${
          options.signatureError ?? 'unknown'
        }`,
      );
    }
    return this.processPayload(endpoint, rawPayload as GitlabWebhookPayload);
  }

  /**
   * Core GitLab pipeline-event processing. Pure function of (endpoint,
   * payload): no identity lookup, no audit I/O (the controller already
   * recorded the event).
   */
  private async processPayload(
    endpoint: WebhookEndpointContext,
    payload: GitlabWebhookPayload,
  ): Promise<WebhookHandleResult> {
    const isPipelineEvent =
      payload.object_kind === 'pipeline' || payload.event_name === 'pipeline';
    if (!isPipelineEvent) {
      return { status: 'ignored' };
    }

    const pipelineId = payload.object_attributes?.id;
    if (!pipelineId) {
      return { status: 'ignored' };
    }

    const target = await this.resolveTarget(endpoint);

    const webhookStatus = payload.object_attributes?.status ?? 'pending';
    const ref = payload.object_attributes?.ref ?? target.branch ?? 'main';
    const sha = payload.object_attributes?.sha ?? '';
    const webUrl =
      payload.object_attributes?.web_url ??
      payload.object_attributes?.url ??
      '';

    const pipelineSnapshot = await this.upsertPipelineWithPreviousStatus(
      endpoint.projectId,
      {
        id: pipelineId,
        status: webhookStatus,
        ref,
        sha,
        web_url: webUrl,
      },
    );

    const transitionedToSuccess =
      pipelineSnapshot.currentStatus === PipelineRunStatus.SUCCESS &&
      pipelineSnapshot.previousStatus !== PipelineRunStatus.SUCCESS;

    // Emit via EventEmitter — decouples GitlabModule from DeploymentsModule
    const pipelineEvent: PipelineUpdatedEvent = {
      pipelineId,
      webhookStatus,
      provider: GitProviderType.GITLAB,
    };
    await this.eventEmitter.emitAsync(DEPLOYMENT_PIPELINE_UPDATED, pipelineEvent);

    if (transitionedToSuccess) {
      const autoDeployEvent: AutoDeployTriggerEvent = {
        projectId: endpoint.projectId,
        branch: ref,
        pipelineId,
        serviceId: target.serviceId ?? undefined,
      };
      await this.eventEmitter.emitAsync(DEPLOYMENT_AUTO_DEPLOY_TRIGGER, autoDeployEvent);
    }

    // Keep the Build row in sync with the pipeline outcome. For REGISTRY
    // builds the Build IS the pipeline; for LOCAL builds this is a no-op
    // (their externalPipelineId is null).
    await this.syncBuildLifecycle(
      endpoint.projectId,
      target.serviceId ?? null,
      ref,
      pipelineId,
      pipelineSnapshot.currentStatus,
      sha || null,
    );

    return { status: 'ok' };
  }

  /**
   * Resolve the deploy target for an endpoint. Prefers the bound
   * ServiceEnvironment (multi-service projects route per repo); otherwise
   * falls back to the project's primary service. Returns the target
   * serviceId + the effective default branch (env override > service).
   */
  private async resolveTarget(
    endpoint: WebhookEndpointContext,
  ): Promise<{ serviceId: string | null; branch: string | null }> {
    if (endpoint.serviceEnvId) {
      const se = await this.prisma.serviceEnvironment.findUnique({
        where: { id: endpoint.serviceEnvId },
        select: {
          serviceId: true,
          branch: true,
          service: { select: { branch: true } },
        },
      });
      if (se) {
        return { serviceId: se.serviceId, branch: se.branch ?? se.service.branch };
      }
    }
    const svc = await this.prisma.service.findFirst({
      where: { projectId: endpoint.projectId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, branch: true },
    });
    return { serviceId: svc?.id ?? null, branch: svc?.branch ?? null };
  }

  /**
   * Find the Build row that corresponds to the given pipeline and update
   * its status to match the pipeline outcome. Best-effort: if no Build
   * matches, we silently no-op.
   */
  private async syncBuildLifecycle(
    projectId: string,
    serviceId: string | null,
    branch: string,
    pipelineId: number,
    pipelineStatus: PipelineRunStatus,
    commitSha: string | null,
  ): Promise<void> {
    try {
      const pipelineIdValue = BigInt(pipelineId);
      const build = await this.prisma.build.findFirst({
        where: {
          projectId,
          ...(serviceId ? { serviceId } : {}),
          branch,
          OR: [
            { externalPipelineId: pipelineIdValue },
            ...(commitSha ? [{ commitSha }] : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!build) {
        return;
      }

      if (pipelineStatus === PipelineRunStatus.SUCCESS) {
        if (build.status === 'SUCCESS' || build.status === 'FAILED') {
          return;
        }
        await this.prisma.build.update({
          where: { id: build.id },
          data: {
            status: 'SUCCESS',
            finishedAt: new Date(),
            commitSha: build.commitSha ?? commitSha,
          },
        });
        return;
      }

      if (
        pipelineStatus === PipelineRunStatus.FAILED ||
        pipelineStatus === PipelineRunStatus.CANCELED
      ) {
        if (build.status === 'SUCCESS' || build.status === 'FAILED') {
          return;
        }
        await this.prisma.build.update({
          where: { id: build.id },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            errorMessage: `Pipeline ${String(pipelineId)} ${String(pipelineStatus).toLowerCase()}`,
            commitSha: build.commitSha ?? commitSha,
          },
        });
        return;
      }

      if (pipelineStatus === PipelineRunStatus.RUNNING && build.status === 'NOT_BUILT') {
        await this.prisma.build.update({
          where: { id: build.id },
          data: {
            status: 'BUILDING',
            startedAt: build.startedAt ?? new Date(),
            commitSha: build.commitSha ?? commitSha,
          },
        });
      }
    } catch (error) {
      this.logger.warn(
        `syncBuildLifecycle best-effort failure (projectId=${projectId}, pipeline=${String(pipelineId)}): ${
          error instanceof Error ? error.message : 'erreur inconnue'
        }`,
      );
    }
  }

  // ─── Pipeline persistence (also used by GitlabCiService) ─────────────────

  async upsertPipeline(
    projectId: string,
    pipeline: GitlabPipelineItem,
  ): Promise<void> {
    await this.prisma.pipelineRun.upsert({
      where: {
        externalId_provider: {
          externalId: BigInt(pipeline.id),
          provider: GitProviderType.GITLAB,
        },
      },
      update: {
        status: this.mapPipelineStatus(pipeline.status),
        branch: pipeline.ref,
        commitSha: pipeline.sha ?? null,
        webUrl: pipeline.web_url ?? null,
      },
      create: {
        projectId,
        externalId: BigInt(pipeline.id),
        provider: GitProviderType.GITLAB,
        status: this.mapPipelineStatus(pipeline.status),
        branch: pipeline.ref,
        commitSha: pipeline.sha ?? null,
        webUrl: pipeline.web_url ?? null,
      },
    });
  }

  async upsertPipelineWithPreviousStatus(
    projectId: string,
    pipeline: GitlabPipelineItem,
  ): Promise<{
    previousStatus: PipelineRunStatus | null;
    currentStatus: PipelineRunStatus;
  }> {
    const currentStatus = this.mapPipelineStatus(pipeline.status);
    const existing = await this.prisma.pipelineRun.findUnique({
      where: {
        externalId_provider: {
          externalId: BigInt(pipeline.id),
          provider: GitProviderType.GITLAB,
        },
      },
      select: {
        status: true,
      },
    });

    await this.upsertPipeline(projectId, pipeline);

    return {
      previousStatus: existing?.status ?? null,
      currentStatus,
    };
  }

  mapPipelineStatus(status?: string): PipelineRunStatus {
    switch ((status ?? '').toLowerCase()) {
      case 'pending':
        return PipelineRunStatus.PENDING;
      case 'running':
        return PipelineRunStatus.RUNNING;
      case 'success':
        return PipelineRunStatus.SUCCESS;
      case 'failed':
        return PipelineRunStatus.FAILED;
      case 'canceled':
      case 'cancelled':
        return PipelineRunStatus.CANCELED;
      default:
        return PipelineRunStatus.PENDING;
    }
  }
}
