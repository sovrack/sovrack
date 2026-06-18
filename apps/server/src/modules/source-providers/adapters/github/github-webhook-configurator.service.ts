import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { GithubFileService } from './github-file.service';
import type { WebhookConfigResult } from '../../contracts/git-provider.contract';

/**
 * Registers (or updates) a webhook on the GitHub repository side.
 * Called by GithubAdapter.configureWebhook() — NOT by the build module.
 *
 * GitHub webhooks API: POST /repos/{owner}/{repo}/hooks
 * For updates: PATCH /repos/{owner}/{repo}/hooks/{hook_id}
 */
@Injectable()
export class GithubWebhookConfiguratorService {
  private readonly logger = new Logger(GithubWebhookConfiguratorService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly fileService: GithubFileService,
  ) {}

  async configureWebhook(
    projectId: string,
    webhookUrl: string,
    secret: string,
  ): Promise<WebhookConfigResult> {
    const { token, apiBase, fullRepoName } =
      await this.fileService.resolveCredentials(projectId);
    const hooksUrl = `${apiBase}/repos/${fullRepoName}/hooks`;
    const headers = this.headers(token);

    const existingId = await this.findExistingHook(
      hooksUrl,
      headers,
      webhookUrl,
    );
    if (existingId !== null) {
      this.logger.warn(
        `GitHub webhook already exists (hookId=${existingId}) for ${fullRepoName}.`,
      );
      return { hookId: existingId, url: webhookUrl };
    }

    try {
      const res = await firstValueFrom(
        this.httpService.post<{ id: number }>(
          hooksUrl,
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
          { headers },
        ),
      );
      this.logger.log(
        `GitHub webhook configured for ${fullRepoName} (hookId=${res.data.id})`,
      );
      return { hookId: res.data.id, url: webhookUrl };
    } catch (err: unknown) {
      this.logger.error(
        `Failed to configure GitHub webhook for ${fullRepoName}: ${String(err)}`,
      );
      throw err;
    }
  }

  private async findExistingHook(
    hooksUrl: string,
    headers: Record<string, string>,
    webhookUrl: string,
  ): Promise<number | null> {
    try {
      const res = await firstValueFrom(
        this.httpService.get<Array<{ id: number; config: { url?: string } }>>(
          hooksUrl,
          { headers },
        ),
      );
      const match = res.data.find((h) => h.config?.url === webhookUrl);
      return match?.id ?? null;
    } catch {
      return null;
    }
  }

  private headers(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }
}
