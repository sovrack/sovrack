import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GitProviderType } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
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
} from '../../../../shared/webhook/webhook-handler.interface';

type GithubPushPayload = {
  ref?: string;
  after?: string;
  repository?: {
    full_name?: string;
    id?: number;
    default_branch?: string;
  };
  pusher?: { name?: string };
  sender?: { login?: string };
};

type GithubWorkflowRunPayload = {
  action?: string;
  workflow_run?: {
    id?: number;
    status?: string;
    conclusion?: string | null;
    head_branch?: string;
    head_sha?: string;
    html_url?: string;
    repository?: { full_name?: string };
  };
  repository?: { full_name?: string };
  installation?: { id?: number };
};

/**
 * GitHub webhook reception handler. Plugged into the unified webhook
 * pipeline via the WEBHOOK_HANDLER registry (see {@link IWebhookHandler}).
 *
 * Identity comes exclusively from the resolved {@link WebhookEndpointContext}
 * (projectId + serviceEnvId) — never from the payload `repository.full_name`.
 * The payload is only read for event data: branch, commit, workflow status.
 */
@Injectable()
export class GithubWebhookHandler implements IWebhookHandler {
  private readonly logger = new Logger(GithubWebhookHandler.name);
  readonly provider = GitProviderType.GITHUB;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Entry point invoked by the unified `POST /webhooks/incoming/:token`
   * controller. Detects the GitHub event type from the payload shape and
   * delegates, using the endpoint as the identity.
   */
  async handleIncoming(
    endpoint: WebhookEndpointContext,
    payload: Record<string, unknown>,
  ): Promise<WebhookHandleResult> {
    if (!endpoint.isActive) {
      return { status: 'ignored' };
    }
    const eventType = this.detectEventType(payload);
    if (eventType === 'push') {
      return this.handlePushEvent(endpoint, payload as GithubPushPayload);
    }
    if (eventType === 'workflow_run') {
      return this.handleWorkflowRunEvent(
        endpoint,
        payload as GithubWorkflowRunPayload,
      );
    }
    return { status: 'ignored' };
  }

  private async handlePushEvent(
    endpoint: WebhookEndpointContext,
    payload: GithubPushPayload,
  ): Promise<WebhookHandleResult> {
    const ref = payload.ref;
    if (!ref) {
      return { status: 'ignored' };
    }

    if (ref.startsWith('refs/tags/')) {
      return { status: 'ignored' };
    }

    const branch = ref.replace(/^refs\/heads\//, '');
    const target = await this.resolveTarget(endpoint);
    if (target.deployTrigger !== 'PUSH') {
      return { status: 'ignored' };
    }
    if (target.branch && target.branch !== branch) {
      return { status: 'ignored' };
    }

    const autoDeployEvent: AutoDeployTriggerEvent = {
      projectId: endpoint.projectId,
      branch,
      pipelineId: 0,
      serviceId: target.serviceId ?? undefined,
    };
    await this.eventEmitter.emitAsync(
      DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
      autoDeployEvent,
    );

    return { status: 'ok' };
  }

  private async handleWorkflowRunEvent(
    endpoint: WebhookEndpointContext,
    payload: GithubWorkflowRunPayload,
  ): Promise<WebhookHandleResult> {
    if (!payload.workflow_run) {
      return { status: 'ignored' };
    }

    const run = payload.workflow_run;
    const conclusion = run.conclusion ?? run.status ?? 'pending';
    const branch = run.head_branch ?? '';
    const runId = run.id;
    if (!runId) {
      return { status: 'ignored' };
    }

    const status = this.mapConclusion(conclusion);

    const pipelineEvent: PipelineUpdatedEvent = {
      pipelineId: runId,
      webhookStatus: status,
      provider: GitProviderType.GITHUB,
    };
    await this.eventEmitter.emitAsync(
      DEPLOYMENT_PIPELINE_UPDATED,
      pipelineEvent,
    );

    if (status === 'success' && branch) {
      const target = await this.resolveTarget(endpoint);
      if (target.deployTrigger !== 'PIPELINE_SUCCESS') {
        return { status: 'ok' };
      }
      if (target.branch && target.branch !== branch) {
        return { status: 'ok' };
      }
      const autoDeployEvent: AutoDeployTriggerEvent = {
        projectId: endpoint.projectId,
        branch,
        pipelineId: runId,
        serviceId: target.serviceId ?? undefined,
      };
      await this.eventEmitter.emitAsync(
        DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
        autoDeployEvent,
      );
    }

    return { status: 'ok' };
  }

  private async resolveTarget(endpoint: WebhookEndpointContext): Promise<{
    serviceId: string | null;
    branch: string | null;
    deployTrigger: string;
  }> {
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

  private detectEventType(
    payload: Record<string, unknown>,
  ): string | undefined {
    if ('workflow_run' in payload) return 'workflow_run';
    if ('ref' in payload && 'repository' in payload) return 'push';
    return undefined;
  }

  private mapConclusion(conclusion: string): string {
    switch (conclusion.toLowerCase()) {
      case 'success':
        return 'success';
      case 'failure':
        return 'failed';
      case 'cancelled':
        return 'canceled';
      case 'in_progress':
        return 'running';
      case 'queued':
        return 'pending';
      default:
        return 'pending';
    }
  }
}
