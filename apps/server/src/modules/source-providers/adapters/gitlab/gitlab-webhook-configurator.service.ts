import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { GitlabFileService } from './gitlab-file.service';
import {
  BaseWebhookConfigurator,
  type NormalizedHook,
  type WebhookRequestContext,
} from '../shared/base-webhook-configurator';

/**
 * Registers a webhook on the GitLab project side.
 * Called by GitlabAdapter.configureWebhook() — NOT by the build module.
 *
 * Only the GitLab-specific bits live here (endpoint URL, PRIVATE-TOKEN header,
 * body shape, response parsing, retry policy, error mapping). The idempotent
 * flow (find-existing-before-create) + retry loop are inherited from
 * {@link BaseWebhookConfigurator} — this is what fixes the historical
 * "blind POST → duplicate hooks on every Re-register" bug for good.
 */
@Injectable()
export class GitlabWebhookConfiguratorService extends BaseWebhookConfigurator {
  protected readonly logger = new Logger(GitlabWebhookConfiguratorService.name);

  constructor(
    http: HttpService,
    private readonly configService: ConfigService,
    private readonly fileService: GitlabFileService,
  ) {
    super(http);
  }

  protected async resolveContext(
    projectId: string,
    serviceId?: string,
  ): Promise<WebhookRequestContext> {
    const context = await this.fileService.resolveRepositoryContext(
      projectId,
      serviceId,
    );
    const id = encodeURIComponent(String(context.gitlabProjectId));
    return {
      label: String(context.gitlabProjectId),
      hooksUrl: `${context.baseUrl}/api/v4/projects/${id}/hooks`,
      headers: { 'PRIVATE-TOKEN': context.token },
    };
  }

  protected async listHooks(
    ctx: WebhookRequestContext,
  ): Promise<NormalizedHook[]> {
    const res = await firstValueFrom(
      this.http.get<Array<{ id: number; url: string; token?: string }>>(
        ctx.hooksUrl,
        { headers: ctx.headers },
      ),
    );
    return res.data.map((h) => ({
      id: h.id,
      url: h.url,
      currentSecret: h.token,
    }));
  }

  protected async createHook(
    ctx: WebhookRequestContext,
    webhookUrl: string,
    secret: string,
  ): Promise<number | string> {
    const res = await firstValueFrom(
      this.http.post<{ id: number }>(
        ctx.hooksUrl,
        {
          url: webhookUrl,
          token: secret,
          push_events: true,
          pipeline_events: true,
        },
        { headers: ctx.headers },
      ),
    );
    return res.data.id;
  }

  protected async updateHookSecret(
    ctx: WebhookRequestContext,
    hookId: number | string,
    secret: string,
  ): Promise<void> {
    await firstValueFrom(
      this.http.put(
        `${ctx.hooksUrl}/${hookId}`,
        { token: secret },
        { headers: ctx.headers },
      ),
    );
  }

  protected retryConfig(): { maxAttempts: number; baseDelayMs: number } {
    return {
      maxAttempts: this.parsePositiveInt(
        this.configService.get<string>('GITLAB_WEBHOOK_MAX_RETRIES', '3'),
        3,
      ),
      baseDelayMs: this.parsePositiveInt(
        this.configService.get<string>('GITLAB_WEBHOOK_RETRY_DELAY_MS', '1200'),
        1200,
      ),
    };
  }

  protected isRetryable(err: unknown): boolean {
    const status = this.fileService.extractHttpStatus(err);
    if (status !== null) return [408, 429, 500, 502, 503, 504].includes(status);
    if (err && typeof err === 'object') {
      const code = (err as { code?: unknown }).code;
      if (typeof code === 'string') {
        return [
          'ECONNABORTED',
          'ECONNRESET',
          'ECONNREFUSED',
          'ENOTFOUND',
          'EHOSTUNREACH',
          'ETIMEDOUT',
        ].includes(code);
      }
    }
    return false;
  }

  protected mapError(err: unknown): never {
    this.fileService.throwGitlabMappedError(
      'configuration du webhook GitLab',
      err,
      'Impossible de configurer le webhook GitLab.',
    );
    // throwGitlabMappedError always throws; this satisfies the `never` return.
    throw err instanceof Error ? err : new Error(String(err));
  }

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    const v = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  }
}
