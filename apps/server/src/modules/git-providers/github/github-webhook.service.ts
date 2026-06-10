import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../core/database/prisma.service';
import { GitProviderType } from '@prisma/client';
import { CryptoService } from '../../../core/crypto/crypto.service';
import { PlatformService } from '../../platform/platform.service';
import {
  DEPLOYMENT_PIPELINE_UPDATED,
  DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
  type PipelineUpdatedEvent,
  type AutoDeployTriggerEvent,
} from '../../deployments/events/deployment.events';
import type { WebhookResult } from '../interfaces/git-provider.interface';

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

@Injectable()
export class GithubWebhookService {
  private readonly logger = new Logger(GithubWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cryptoService: CryptoService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly platformService: PlatformService,
  ) {}

  /**
   * Generate a fresh webhook secret for a GitHub repo.
   * 32 bytes → 64 hex chars, matches GitHub's recommended entropy.
   */
  generateWebhookSecret(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Encrypt the secret before storing it in DB.
   */
  encryptSecret(secret: string): string {
    return this.cryptoService.encrypt(secret);
  }

  /**
   * Decrypt the secret stored in DB.
   */
  decryptSecret(encrypted: string): string {
    return this.cryptoService.decrypt(encrypted);
  }

  /**
   * Resolve the provider + repo link for a given repo full_name.
   * Used by the controller to know which secret to use for HMAC verification.
   */
  async resolveProviderAndSecretByRepo(
    repoFullName: string,
  ): Promise<{
    providerId: string;
    repoLinkId: string;
    secret: string;
  } | null> {
    if (!repoFullName) {
      return null;
    }

    const repoLink = await this.prisma.gitProviderRepo.findFirst({
      where: { repoFullName },
      include: { provider: true },
    });

    if (!repoLink?.provider || repoLink.provider.type !== GitProviderType.GITHUB) {
      return null;
    }

    if (!repoLink.webhookSecret) {
      return null;
    }

    const secret = this.cryptoService.decrypt(repoLink.webhookSecret);
    return {
      providerId: repoLink.providerId,
      repoLinkId: repoLink.id,
      secret,
    };
  }

  /**
   * Resolve a provider by ID and return its webhook secret.
   * Used when the webhook URL contains the providerId.
   */
  async resolveProviderAndSecretByProviderId(
    providerId: string,
  ): Promise<{
    providerId: string;
    secret: string | null;
  } | null> {
    const provider = await this.prisma.gitProviderConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider || provider.type !== GitProviderType.GITHUB) {
      return null;
    }

    if (!provider.applicationSecret) {
      return { providerId, secret: null };
    }

    const secret = this.cryptoService.decrypt(provider.applicationSecret);
    return { providerId, secret };
  }

  /**
   * Verify GitHub webhook HMAC-SHA256 signature.
   * GitHub sends: X-Hub-Signature-256: sha256=<hmac>
   *
   * Two lookup strategies:
   *  1) providerId passed in URL → use provider.applicationSecret
   *  2) No providerId → lookup by repo.full_name in GitProviderRepo
   *
   * If both fail, reject the webhook.
   */
  async verifyWebhookSignature(
    signatureHeader: string | undefined,
    rawBody: string,
    options: { providerId?: string; repoFullName?: string } = {},
  ): Promise<{ providerId: string; repoLinkId: string | null }> {
    if (!signatureHeader?.startsWith('sha256=')) {
      throw new ForbiddenException('Signature webhook GitHub manquante');
    }

    const receivedHex = signatureHeader.slice('sha256='.length);

    // Try provider-level secret first (URL-based pattern)
    if (options.providerId) {
      const result = await this.resolveProviderAndSecretByProviderId(
        options.providerId,
      );
      if (result?.secret) {
        if (this.verifyHmac(receivedHex, result.secret, rawBody)) {
          return { providerId: result.providerId, repoLinkId: null };
        }
        throw new ForbiddenException('Signature webhook GitHub invalide');
      }
    }

    // Fallback: lookup by repo name
    if (options.repoFullName) {
      const result = await this.resolveProviderAndSecretByRepo(
        options.repoFullName,
      );
      if (result) {
        if (this.verifyHmac(receivedHex, result.secret, rawBody)) {
          return {
            providerId: result.providerId,
            repoLinkId: result.repoLinkId,
          };
        }
        throw new ForbiddenException('Signature webhook GitHub invalide');
      }
    }

    throw new ForbiddenException(
      'Aucun provider GitHub configuré pour ce webhook',
    );
  }

  private verifyHmac(
    receivedHex: string,
    secret: string,
    rawBody: string,
  ): boolean {
    const expected = createHmac('sha256', secret)
      .update(rawBody, 'utf-8')
      .digest('hex');

    const receivedBuf = Buffer.from(receivedHex, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');

    if (receivedBuf.length !== expectedBuf.length) {
      return false;
    }
    return timingSafeEqual(receivedBuf, expectedBuf);
  }

  /**
   * Handle incoming webhook events.
   * Supports both `push` (most common) and `workflow_run` events.
   */
  async handleWebhook(
    payload: unknown,
    eventType?: string,
  ): Promise<WebhookResult> {
    // Push event: trigger auto-deploy on push to watched branches
    if (eventType === 'push') {
      return this.handlePushEvent(payload as GithubPushPayload);
    }

    // Workflow run event: track GitHub Actions pipeline status
    if (eventType === 'workflow_run') {
      return this.handleWorkflowRunEvent(payload as GithubWorkflowRunPayload);
    }

    return { status: 'ignored' };
  }

  private async handlePushEvent(
    payload: GithubPushPayload,
  ): Promise<WebhookResult> {
    const repoFullName = payload.repository?.full_name;
    const ref = payload.ref;

    if (!repoFullName || !ref) {
      return { status: 'ignored' };
    }

    // Extract branch name from ref (refs/heads/main → main)
    const branch = ref.replace(/^refs\/heads\//, '');

    // Find the GitProviderRepo link
    const repoLink = await this.prisma.gitProviderRepo.findFirst({
      where: { repoFullName },
    });

    if (!repoLink) {
      this.logger.debug(
        `Push received for unknown repo ${repoFullName} — ignored`,
      );
      return { status: 'ignored' };
    }

    if (!repoLink.projectId) {
      this.logger.debug(
        `Push received for repo ${repoFullName} with no project link`,
      );
      return { status: 'ignored' };
    }

    // Emit auto-deploy event
    const autoDeployEvent: AutoDeployTriggerEvent = {
      projectId: repoLink.projectId,
      branch,
      pipelineId: 0, // No GitLab pipeline equivalent
      serviceId: undefined,
    };

    await this.eventEmitter.emitAsync(
      DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
      autoDeployEvent,
    );

    return { status: 'ok' };
  }

  private async handleWorkflowRunEvent(
    payload: GithubWorkflowRunPayload,
  ): Promise<WebhookResult> {
    if (!payload.workflow_run) {
      return { status: 'ignored' };
    }

    const run = payload.workflow_run;
    const fullName = run.repository?.full_name ?? payload.repository?.full_name;
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
      provider: GitProviderType.GITHUB,
    };
    await this.eventEmitter.emitAsync(
      DEPLOYMENT_PIPELINE_UPDATED,
      pipelineEvent,
    );

    if (status === 'success' && branch) {
      // Lookup project for this repo
      const repoLink = await this.prisma.gitProviderRepo.findFirst({
        where: { repoFullName: fullName },
        select: { projectId: true },
      });

      if (repoLink?.projectId) {
        const autoDeployEvent: AutoDeployTriggerEvent = {
          projectId: repoLink.projectId,
          branch,
          pipelineId: runId,
        };
        await this.eventEmitter.emitAsync(
          DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
          autoDeployEvent,
        );
      }
    }

    return { status: 'ok' };
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

  /**
   * Create a webhook on a GitHub repo via the GitHub API.
   * Returns the webhook ID created on the GitHub side.
   */
  async createWebhookOnGithub(
    apiBase: string,
    token: string,
    repoFullName: string,
    webhookUrl: string,
    secret: string,
  ): Promise<{ id: string; webhookId: string }> {
    const response = await firstValueFrom(
      this.httpService.post(
        `${apiBase}/repos/${repoFullName}/hooks`,
        {
          name: 'web',
          active: true,
          events: ['push', 'pull_request', 'workflow_run'],
          config: {
            url: webhookUrl,
            content_type: 'json',
            secret,
            insecure_ssl: '0',
          },
        },
        { headers: { Authorization: `Bearer ${token}` } },
      ),
    );

    const data = response.data as { id: number };
    return { id: String(data.id), webhookId: String(data.id) };
  }

  /**
   * Compute the public webhook URL for a given provider.
   * Resolution order:
   *   1. baseUrl arg (explicit override)
   *   2. PlatformService.buildWebhookUrl() — DB first, env fallback
   */
  async buildWebhookUrl(
    providerId: string,
    baseUrl?: string,
  ): Promise<string> {
    if (baseUrl?.trim()) {
      return `${baseUrl.replace(/\/+$/, '')}/github/webhook/${providerId}`;
    }
    return this.platformService.buildWebhookUrl(
      `github/webhook/${providerId}`,
    );
  }

  /**
   * Unified entry point called by IncomingWebhookController.dispatch().
   * Detects GitHub event type from payload shape and delegates to handleWebhook.
   */
  async handleIncoming(
    _endpoint: { id: string; projectId: string; isActive: boolean },
    payload: Record<string, unknown>,
  ): Promise<WebhookResult> {
    const eventType = this.detectEventType(payload);
    return this.handleWebhook(payload, eventType);
  }

  private detectEventType(payload: Record<string, unknown>): string | undefined {
    if ('workflow_run' in payload) return 'workflow_run';
    if ('ref' in payload && 'repository' in payload) return 'push';
    return undefined;
  }
}
