import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { GitlabFileService } from './gitlab-file.service';
import type { WebhookConfigResult } from '../../interfaces/source-provider.interface';

/**
 * Registers (or updates) a webhook on the GitLab project side.
 * Called by GitlabService.configureWebhook() — NOT by the build module.
 *
 * The webhookUrl and secret are provided by the caller
 * (WebhookManagementService), which owns the WebhookEndpoint lifecycle.
 */
@Injectable()
export class GitlabWebhookConfiguratorService {
  private readonly logger = new Logger(GitlabWebhookConfiguratorService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly fileService: GitlabFileService,
  ) {}

  async configureWebhook(
    projectId: string,
    webhookUrl: string,
    secret: string,
    serviceId?: string,
  ): Promise<WebhookConfigResult> {
    const context = await this.fileService.resolveRepositoryContext(projectId, serviceId);

    const maxAttempts = this.parsePositiveInt(
      this.configService.get<string>('GITLAB_WEBHOOK_MAX_RETRIES', '3'),
      3,
    );
    const retryDelayMs = this.parsePositiveInt(
      this.configService.get<string>('GITLAB_WEBHOOK_RETRY_DELAY_MS', '1200'),
      1200,
    );

    const hooksUrl =
      `${context.baseUrl}/api/v4/projects/${encodeURIComponent(String(context.gitlabProjectId))}/hooks`;
    const headers = { 'PRIVATE-TOKEN': context.token };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await firstValueFrom(
          this.httpService.post<{ id: number }>(
            hooksUrl,
            { url: webhookUrl, token: secret, push_events: true, pipeline_events: true },
            { headers },
          ),
        );
        this.logger.log(
          `GitLab webhook configured for project ${String(context.gitlabProjectId)} (hookId=${res.data.id})`,
        );
        return { hookId: res.data.id, url: webhookUrl };
      } catch (err: unknown) {
        const status = this.fileService.extractHttpStatus(err);
        const msg = this.fileService.extractGitlabErrorMessage(err).toLowerCase();
        const isDuplicate =
          status === 409 || msg.includes('has already been taken') || msg.includes('already exists');

        if (isDuplicate) {
          this.logger.warn(
            `GitLab webhook already exists for project ${String(context.gitlabProjectId)}.`,
          );
          return { hookId: 'existing', url: webhookUrl };
        }

        if (attempt < maxAttempts && this.isRetryable(err, status)) {
          const backoff = retryDelayMs * attempt;
          this.logger.warn(
            `[GitLab] webhook attempt ${attempt}/${maxAttempts} failed. Retrying in ${backoff}ms…`,
          );
          await this.sleep(backoff);
          continue;
        }

        this.fileService.throwGitlabMappedError(
          'configuration du webhook GitLab',
          err,
          'Impossible de configurer le webhook GitLab.',
        );
      }
    }

    // Unreachable — throwGitlabMappedError always throws
    return { hookId: '', url: webhookUrl };
  }

  private isRetryable(err: unknown, status: number | null): boolean {
    if (status !== null) return [408, 429, 500, 502, 503, 504].includes(status);
    if (err && typeof err === 'object') {
      const code = (err as { code?: unknown }).code;
      if (typeof code === 'string') {
        return ['ECONNABORTED', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT'].includes(code);
      }
    }
    return false;
  }

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    const v = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
