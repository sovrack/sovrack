import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppSourceType, PipelineRunStatus } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { GitlabCryptoService } from './gitlab-crypto.service';
import { GitlabPipelineItem } from './gitlab-api.service';
import {
  DEPLOYMENT_PIPELINE_UPDATED,
  DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
  type PipelineUpdatedEvent,
  type AutoDeployTriggerEvent,
} from '../../deployments/events/deployment.events';
import { WebhooksService } from '../webhooks/webhooks.service';
import { GitProviderType } from '@prisma/client';

export type GitlabWebhookPayload = {
  object_kind?: string;
  event_name?: string;
  group_id?: number;
  project_id?: number;
  project?: {
    id?: number;
    namespace_id?: number;
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

@Injectable()
export class GitlabWebhookService {
  private readonly logger = new Logger(GitlabWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: GitlabCryptoService,
    private readonly eventEmitter: EventEmitter2,
    private readonly webhooksService: WebhooksService,
  ) {}

  /**
   * Public entry point for the unified `POST /webhooks/incoming/:token`
   * controller. The endpoint has already been resolved by the controller
   * (O(1) via the unique index on `webhookToken`) and the event has
   * already been recorded in `WebhookEvent`. We just process.
   *
   * Signature verification is NOT done here — the controller is the
   * trust boundary, and it forwards a `verified` flag so we can decide
   * whether to surface signature failures in the audit log.
   */
  async handleIncoming(
    endpoint: { id: string; projectId: string; isActive: boolean },
    rawPayload: Record<string, unknown>,
    options: { verified: boolean; signatureError?: string } = { verified: true },
  ): Promise<{ status: 'ignored' | 'ok' }> {
    if (!endpoint.isActive) {
      // Controller should have caught this, but defend in depth.
      return { status: 'ignored' };
    }
    if (!options.verified) {
      this.logger.warn(
        `handleIncoming on endpoint ${endpoint.id} with invalid signature: ${
          options.signatureError ?? 'unknown'
        }`,
      );
    }
    return this.processPayload(rawPayload as GitlabWebhookPayload);
  }

  /**
   * Legacy entry point for `POST /gitlab/webhook` (per-provider URL).
   * Kept for backward compat with existing GitLab installations that
   * still have the old URL configured. Records the audit log via the
   * magic `service.gitlabProjectId` lookup (a no-op if the new
   * endpoint system has not been migrated yet).
   */
  async handleWebhook(
    payload: GitlabWebhookPayload,
  ): Promise<{ status: 'ignored' | 'ok' }> {
    // P4-#1 backward-compat: when called from the legacy `POST /gitlab/webhook`
    // route (no pre-resolved endpoint), do the best-effort magic lookup.
    // P4-#2 unified endpoint path uses `handleIncoming` with the resolved
    // endpoint, which records the audit log inside the controller.
    await this.tryRecordAuditEvent(payload);
    return this.processPayload(payload);
  }

  /**
   * Core GitLab webhook processing: kind check, config lookup, build
   * lifecycle sync. Shared between the legacy and unified entry points.
   * Pure function of the payload — no I/O for audit logging.
   */
  private async processPayload(
    payload: GitlabWebhookPayload,
  ): Promise<{ status: 'ignored' | 'ok' }> {
    const isPipelineEvent =
      payload.object_kind === 'pipeline' || payload.event_name === 'pipeline';

    if (!isPipelineEvent) {
      return { status: 'ignored' };
    }

    const gitlabProjectId = payload.project_id ?? payload.project?.id ?? null;
    const gitlabGroupId = this.extractWebhookGroupId(
      payload as Record<string, unknown>,
    );
    const pipelineId = payload.object_attributes?.id;

    if (!pipelineId || (!gitlabProjectId && !gitlabGroupId)) {
      return { status: 'ignored' };
    }

    const config = await this.prisma.appProviderLink.findFirst({
      where: {
        OR: [
          ...(gitlabProjectId
            ? [
                {
                  sourceType: AppSourceType.REPO,
                  externalId: gitlabProjectId,
                },
              ]
            : []),
          ...(gitlabGroupId
            ? [
                {
                  sourceType: AppSourceType.GROUP,
                  externalGroupId: gitlabGroupId,
                },
              ]
            : []),
        ],
      },
    });

    if (!config) {
      return { status: 'ignored' };
    }

    // Also try to lookup via GitProviderRepo (preferred path: per-project webhook secret).
    // This is used for the new GitProviderRepo model which provides isolation between projects.
    const repoLink = await this.prisma.gitProviderRepo.findFirst({
      where: {
        providerId: config.providerId ?? undefined,
        externalRepoIdBig: gitlabProjectId ? BigInt(gitlabProjectId) : undefined,
      },
    });
    if (repoLink?.projectId) {
      // The repoLink has a projectId that takes precedence over the GitlabConfig projectId.
      // This allows the same GitLab repo to be linked to a specific project.
      // (Currently we just log this for debugging — the projectId from config is still used.)
      this.logger.debug(
        `GitLab webhook: repo ${String(gitlabProjectId)} linked to project ${repoLink.projectId}`,
      );
    }

    const webhookStatus = payload.object_attributes?.status ?? 'pending';
    const ref = payload.object_attributes?.ref ?? config.defaultBranch;
    const sha = payload.object_attributes?.sha ?? '';
    const webUrl =
      payload.object_attributes?.web_url ??
      payload.object_attributes?.url ??
      '';

    const service = gitlabProjectId
      ? await this.prisma.projectService.findFirst({
          where: {
            projectId: config.projectId,
            externalRepoId: gitlabProjectId,
          },
          select: { id: true },
        })
      : null;

    const pipelineSnapshot = await this.upsertPipelineWithPreviousStatus(
      config.projectId,
      {
        id: pipelineId,
        status: webhookStatus,
        ref,
        sha,
        web_url: webUrl,
      },
      service?.id,
    );

    const transitionedToSuccess =
      pipelineSnapshot.currentStatus === PipelineRunStatus.SUCCESS &&
      pipelineSnapshot.previousStatus !== PipelineRunStatus.SUCCESS;

    // Emit via EventEmitter — decouples GitlabModule from DeploymentsModule
    const pipelineEvent: PipelineUpdatedEvent = { pipelineId, webhookStatus, provider: GitProviderType.GITLAB };
    await this.eventEmitter.emitAsync(DEPLOYMENT_PIPELINE_UPDATED, pipelineEvent);

    if (transitionedToSuccess) {
      const autoDeployEvent: AutoDeployTriggerEvent = {
        projectId: config.projectId,
        branch: ref,
        pipelineId,
        serviceId: service?.id,
      };
      await this.eventEmitter.emitAsync(DEPLOYMENT_AUTO_DEPLOY_TRIGGER, autoDeployEvent);
    }

    // P2-#2: keep the Build row in sync with the pipeline outcome. For
    // REGISTRY builds, the Build IS the pipeline — when the pipeline ends,
    // the Build ends. For LOCAL builds the Build succeeds at deploy-end
    // (handled in DeploymentsAnsibleService), so this update is a no-op
    // for those (their gitlabPipelineId is null).
    await this.syncBuildLifecycle(
      config.projectId,
      service?.id ?? null,
      ref,
      pipelineId,
      pipelineSnapshot.currentStatus,
      sha || null,
    );

    return { status: 'ok' };
  }

  /**
   * Find the Build row that corresponds to the given pipeline and update
   * its status to match the pipeline outcome. Best-effort: if no Build
   * matches, we silently no-op (the build may have been created without
   * a pipeline — e.g. a manual `docker pull` or LOCAL build).
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

  async verifyWebhookToken(
    token?: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    if (!token) {
      throw new ForbiddenException('Token webhook GitLab manquant');
    }

    const projectId = this.extractWebhookProjectId(payload);
    const groupId = this.extractWebhookGroupId(payload);
    const lookupIds = Array.from(
      new Set([projectId, groupId].filter((id): id is number => id !== null)),
    );

    if (lookupIds.length > 0) {
      const config = await this.prisma.appProviderLink.findFirst({
        where: {
          OR: lookupIds.flatMap((id) => [
            {
              sourceType: AppSourceType.REPO,
              externalId: id,
            },
            {
              sourceType: AppSourceType.GROUP,
              externalGroupId: id,
            },
          ]),
        },
      });

      if (config?.webhookSecret) {
        const expectedSecret = this.crypto.decryptConfigToken(
          config.webhookSecret,
        );
        const tokenBuf = Buffer.from(token);
        const expectedBuf = Buffer.from(expectedSecret);
        if (
          tokenBuf.length === expectedBuf.length &&
          timingSafeEqual(tokenBuf, expectedBuf)
        ) {
          return;
        }
      }

      throw new ForbiddenException('Token webhook GitLab invalide');
    }

    throw new ForbiddenException('Token webhook GitLab invalide');
  }

  extractWebhookProjectId(payload?: Record<string, unknown>): number | null {
    if (!payload) {
      return null;
    }

    const projectId = payload.project_id;
    if (typeof projectId === 'number') {
      return projectId;
    }

    if (payload.project && typeof payload.project === 'object') {
      const project = payload.project as Record<string, unknown>;
      if (typeof project.id === 'number') {
        return project.id;
      }
    }

    return null;
  }

  extractWebhookGroupId(payload?: Record<string, unknown>): number | null {
    if (!payload) {
      return null;
    }

    const groupId = payload.group_id;
    if (typeof groupId === 'number') {
      return groupId;
    }

    if (payload.project && typeof payload.project === 'object') {
      const project = payload.project as Record<string, unknown>;

      if (typeof project.namespace_id === 'number') {
        return project.namespace_id;
      }

      if (project.namespace && typeof project.namespace === 'object') {
        const namespace = project.namespace as Record<string, unknown>;
        if (typeof namespace.id === 'number') {
          return namespace.id;
        }
      }
    }

    return null;
  }

  async upsertPipeline(
    projectId: string,
    pipeline: GitlabPipelineItem,
    serviceId?: string,
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
        serviceId,
      },
      create: {
        projectId,
        serviceId,
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
    serviceId?: string,
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

    await this.upsertPipeline(projectId, pipeline, serviceId);

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

  /**
   * Best-effort audit log of an incoming webhook. Looks up the
   * WebhookEndpoint for the (project, provider) tuple — if the project
   * hasn't been wired through the new endpoint system yet, this is a
   * silent no-op. The audit log must never break the webhook handler.
   */
  private async tryRecordAuditEvent(
    payload: GitlabWebhookPayload,
  ): Promise<void> {
    try {
      const gitlabProjectId =
        payload.project_id ?? payload.project?.id ?? null;
      if (!gitlabProjectId) return;
      const endpoint = await this.prisma.webhookEndpoint.findFirst({
        where: {
          provider: GitProviderType.GITLAB,
          service: { externalRepoId: BigInt(gitlabProjectId) },
        },
        select: { id: true },
      });
      if (!endpoint) return;

      const eventType = payload.object_kind ?? payload.event_name ?? 'unknown';
      const deliveryId =
        (payload as { 'X-Gitlab-Event-UUID'?: string })['X-Gitlab-Event-UUID'] ??
        (payload as { delivery_id?: string }).delivery_id ??
        null;

      await this.webhooksService.record({
        endpointId: endpoint.id,
        provider: GitProviderType.GITLAB,
        eventType,
        externalDeliveryId: deliveryId,
        payload: payload as never,
        headers: {
          'x-gitlab-event': payload.object_kind ?? null,
          'x-gitlab-event-uuid': deliveryId,
        },
      });
    } catch (error) {
      this.logger.warn(
        `tryRecordAuditEvent best-effort failure: ${
          error instanceof Error ? error.message : 'erreur inconnue'
        }`,
      );
    }
  }
}
