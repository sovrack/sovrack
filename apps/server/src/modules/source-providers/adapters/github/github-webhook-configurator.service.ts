import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { GithubFileService } from './github-file.service';
import {
  BaseWebhookConfigurator,
  type NormalizedHook,
  type WebhookRequestContext,
} from '../shared/base-webhook-configurator';

/**
 * Registers a webhook on the GitHub repository side.
 * Called by GithubAdapter.configureWebhook() — NOT by the build module.
 *
 * Only the GitHub-specific bits live here (endpoint URL, auth headers, body
 * shape, response parsing). The idempotent flow (find-existing-before-create)
 * + retry/backoff are inherited from {@link BaseWebhookConfigurator}.
 *
 * GitHub webhooks API: POST /repos/{owner}/{repo}/hooks
 */
@Injectable()
export class GithubWebhookConfiguratorService extends BaseWebhookConfigurator {
  protected readonly logger = new Logger(GithubWebhookConfiguratorService.name);

  constructor(
    http: HttpService,
    private readonly fileService: GithubFileService,
  ) {
    super(http);
  }

  protected retryConfig(): { maxAttempts: number; baseDelayMs: number } {
    return { maxAttempts: 3, baseDelayMs: 1200 };
  }

  protected isRetryable(err: unknown): boolean {
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      if (status !== undefined) {
        return [408, 429, 500, 502, 503, 504].includes(status);
      }
      if (err.code) {
        return [
          'ECONNABORTED',
          'ECONNRESET',
          'ECONNREFUSED',
          'ENOTFOUND',
          'EHOSTUNREACH',
          'ETIMEDOUT',
        ].includes(err.code);
      }
    }
    return false;
  }

  protected async resolveContext(
    projectId: string,
  ): Promise<WebhookRequestContext> {
    const { token, apiBase, fullRepoName } =
      await this.fileService.resolveCredentials(projectId);
    return {
      label: fullRepoName,
      hooksUrl: `${apiBase}/repos/${fullRepoName}/hooks`,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };
  }

  protected async listHooks(
    ctx: WebhookRequestContext,
  ): Promise<NormalizedHook[]> {
    const res = await firstValueFrom(
      this.http.get<Array<{ id: number; config?: { url?: string } }>>(
        ctx.hooksUrl,
        { headers: ctx.headers },
      ),
    );
    return res.data
      .filter((h) => typeof h.config?.url === 'string')
      .map((h) => ({ id: h.id, url: h.config!.url! }));
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
          name: 'web',
          active: true,
          events: ['push', 'workflow_run'],
          config: {
            url: webhookUrl,
            content_type: 'json',
            secret,
            insecure_ssl: '0',
          },
        },
        { headers: ctx.headers },
      ),
    );
    return res.data.id;
  }

  /**
   * GitHub's GET /hooks returns `config.secret` as masked (`"********"`),
   * so we cannot read the actual secret. We always issue the PATCH to stay
   * in sync — the cost is one extra call per re-configure, which is rare.
   */
  protected async updateHookSecret(
    ctx: WebhookRequestContext,
    hookId: number | string,
    secret: string,
  ): Promise<void> {
    await firstValueFrom(
      this.http.patch(
        `${ctx.hooksUrl}/${hookId}`,
        { config: { secret } },
        { headers: ctx.headers },
      ),
    );
  }
}
