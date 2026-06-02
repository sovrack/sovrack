import { createHmac, timingSafeEqual } from 'crypto';
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../core/database/prisma.service';
import { GitProviderType } from '@prisma/client';
import {
  DEPLOYMENT_PIPELINE_UPDATED,
  DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
  type PipelineUpdatedEvent,
  type AutoDeployTriggerEvent,
} from '../../deployments/events/deployment.events';
import type { WebhookResult } from '../interfaces/git-provider.interface';

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

@Injectable()
export class GithubWebhookService {
  private readonly logger = new Logger(GithubWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async handleWebhook(payload: unknown): Promise<WebhookResult> {
    const p = payload as GithubWorkflowRunPayload;

    // Only handle workflow_run events
    if (!p.workflow_run) {
      return { status: 'ignored' };
    }

    const run = p.workflow_run;
    const fullName = run.repository?.full_name ?? p.repository?.full_name;
    const conclusion = run.conclusion ?? run.status ?? 'pending';
    const branch = run.head_branch ?? '';
    const runId = run.id;

    if (!fullName || !runId) {
      return { status: 'ignored' };
    }

    const status = this.mapConclusion(conclusion);

    const pipelineEvent: PipelineUpdatedEvent = {
      pipelineId: runId,
      webhookStatus: status,
    };
    await this.eventEmitter.emitAsync(DEPLOYMENT_PIPELINE_UPDATED, pipelineEvent);

    if (status === 'success' && branch) {
      const autoDeployEvent: AutoDeployTriggerEvent = {
        projectId: await this.resolveProjectIdByRepo(fullName) ?? '',
        branch,
        pipelineId: runId,
      };
      if (autoDeployEvent.projectId) {
        await this.eventEmitter.emitAsync(DEPLOYMENT_AUTO_DEPLOY_TRIGGER, autoDeployEvent);
      }
    }

    return { status: 'ok' };
  }

  /**
   * Verify GitHub webhook HMAC-SHA256 signature.
   * GitHub sends: X-Hub-Signature-256: sha256=<hmac>
   */
  async verifyWebhookSignature(
    signatureHeader: string | undefined,
    rawBody: string,
    providerId?: string,
  ): Promise<void> {
    if (!signatureHeader?.startsWith('sha256=')) {
      throw new ForbiddenException('Signature webhook GitHub manquante');
    }

    const receivedHex = signatureHeader.slice('sha256='.length);

    const secret = await this.resolveWebhookSecret(providerId);
    if (!secret) {
      throw new ForbiddenException('Secret webhook GitHub non configuré');
    }

    const expected = createHmac('sha256', secret)
      .update(rawBody, 'utf-8')
      .digest('hex');

    const receivedBuf = Buffer.from(receivedHex, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');

    if (
      receivedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(receivedBuf, expectedBuf)
    ) {
      throw new ForbiddenException('Signature webhook GitHub invalide');
    }
  }

  private mapConclusion(conclusion: string): string {
    switch (conclusion.toLowerCase()) {
      case 'success': return 'success';
      case 'failure': return 'failed';
      case 'cancelled': return 'canceled';
      case 'in_progress': return 'running';
      case 'queued': return 'pending';
      default: return 'pending';
    }
  }

  private async resolveProjectIdByRepo(fullName: string): Promise<string | null> {
    const config = await this.prisma.gitlabConfig.findFirst({
      where: { project: { gitlabUrl: { contains: fullName } } },
      select: { projectId: true },
    });
    return config?.projectId ?? null;
  }

  private async resolveWebhookSecret(providerId?: string): Promise<string | null> {
    if (!providerId) return null;
    const provider = await this.prisma.gitProviderConfig.findUnique({
      where: { id: providerId },
      select: { applicationSecret: true, type: true },
    });
    if (provider?.type !== GitProviderType.GITHUB) return null;
    return provider.applicationSecret ?? null;
  }
}
