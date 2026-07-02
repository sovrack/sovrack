import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GitProviderType, PipelineRunStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { GitlabPipelinePersistenceService } from '../../../source-providers/adapters/gitlab/gitlab-pipeline-persistence.service';
import {
  DEPLOYMENT_PIPELINE_UPDATED,
  DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
  type PipelineUpdatedEvent,
  type AutoDeployTriggerEvent,
} from '../../../../shared/events/events.catalog';
import {
  IWebhookHandler,
  WebhookEndpointContext,
  WebhookHandleResult,
} from '../../interfaces/webhook-handler.interface';

export type GitlabWebhookPayload = {
  object_kind?: string;
  event_name?: string;
  ref?: string; // push event: "refs/heads/<branch>"
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
    private readonly pipelinePersistence: GitlabPipelinePersistenceService,
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
    options: { verified: boolean; signatureError?: string } = {
      verified: true,
    },
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
    // Deploy-on-push : si le service est en mode PUSH, un push sur sa branche
    // déclenche directement un déploiement (façon Coolify/Vercel).
    const isPushEvent =
      payload.object_kind === 'push' || payload.event_name === 'push';
    if (isPushEvent) {
      const target = await this.resolveTarget(endpoint);
      if (target.deployTrigger !== 'PUSH') {
        return { status: 'ignored' };
      }
      const branch =
        (payload.ref ?? '').replace('refs/heads/', '') ||
        target.branch ||
        'main';
      const pushEvent: AutoDeployTriggerEvent = {
        projectId: endpoint.projectId,
        branch,
        serviceId: target.serviceId ?? undefined,
      };
      await this.eventEmitter.emitAsync(
        DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
        pushEvent,
      );
      return { status: 'ok' };
    }

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

    const pipelineSnapshot =
      await this.pipelinePersistence.upsertPipelineWithPreviousStatus(
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
    await this.eventEmitter.emitAsync(
      DEPLOYMENT_PIPELINE_UPDATED,
      pipelineEvent,
    );

    // On ne déploie sur succès de pipeline QUE si le service est en mode
    // PIPELINE_SUCCESS (sinon, ex. mode PUSH, le déclencheur est le push → on
    // éviterait un double déploiement).
    if (transitionedToSuccess && target.deployTrigger === 'PIPELINE_SUCCESS') {
      const autoDeployEvent: AutoDeployTriggerEvent = {
        projectId: endpoint.projectId,
        branch: ref,
        pipelineId,
        serviceId: target.serviceId ?? undefined,
      };
      await this.eventEmitter.emitAsync(
        DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
        autoDeployEvent,
      );
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
  private async resolveTarget(endpoint: WebhookEndpointContext): Promise<{
    serviceId: string | null;
    branch: string | null;
    deployTrigger: string;
  }> {
    // Webhook PAR SERVICE : identité directe (la branche du push route ensuite
    // vers le bon environnement via ServiceEnvironment.autoBranch côté trigger).
    if (endpoint.serviceId) {
      const svc = await this.prisma.service.findUnique({
        where: { id: endpoint.serviceId },
        select: { id: true, branch: true, deployTrigger: true },
      });
      if (svc) {
        return {
          serviceId: svc.id,
          branch: svc.branch,
          deployTrigger: svc.deployTrigger ?? 'PIPELINE_SUCCESS',
        };
      }
    }
    if (endpoint.serviceEnvId) {
      const se = await this.prisma.serviceEnvironment.findUnique({
        where: { id: endpoint.serviceEnvId },
        select: {
          serviceId: true,
          branch: true,
          service: { select: { branch: true, deployTrigger: true } },
        },
      });
      if (se) {
        return {
          serviceId: se.serviceId,
          branch: se.branch ?? se.service.branch,
          deployTrigger: se.service.deployTrigger ?? 'PIPELINE_SUCCESS',
        };
      }
    }
    const svc = await this.prisma.service.findFirst({
      where: { projectId: endpoint.projectId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, branch: true, deployTrigger: true },
    });
    return {
      serviceId: svc?.id ?? null,
      branch: svc?.branch ?? null,
      deployTrigger: svc?.deployTrigger ?? 'PIPELINE_SUCCESS',
    };
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

      if (
        pipelineStatus === PipelineRunStatus.RUNNING &&
        build.status === 'NOT_BUILT'
      ) {
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

}
