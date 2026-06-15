import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import type {
  RepoItem,
  BranchItem,
  PipelineItem,
  WebhookConfigResult,
} from '../../contracts/git-provider.contract';

type GiteaRepoRaw = {
  id: number;
  name: string;
  full_name: string;
  clone_url: string;
  default_branch: string;
  description?: string | null;
};

type GiteaBranchRaw = {
  name: string;
  commit: { id: string };
};

type GiteaActionRunRaw = {
  id: number;
  status: string;
  // Gitea exposes the triggering ref/sha under a few possible names across
  // versions — read defensively in toPipelineItem.
  head_branch?: string;
  ref?: string;
  head_sha?: string;
  html_url?: string;
  created?: string;
  created_at?: string;
};

type GiteaContentRaw = {
  content?: string;
  encoding?: string;
  sha?: string;
};

/**
 * Thin HTTP client for the Gitea REST API (`{base}/api/v1`). Gitea models its
 * API on GitHub's, so the shapes are close but not identical (auth header is
 * `token <pat>`, branch commit is `commit.id`, Actions runs live under
 * `/actions/tasks`). Only the operations IGitProvider needs are implemented.
 */
@Injectable()
export class GiteaClient {
  private readonly logger = new Logger(GiteaClient.name);

  constructor(private readonly httpService: HttpService) {}

  /** Build the `/api/v1` base from a configured Gitea instance URL. */
  buildApiBase(providerUrl: string): string {
    return `${providerUrl.replace(/\/+$/, '')}/api/v1`;
  }

  private authHeaders(token: string): Record<string, string> {
    return { Authorization: `token ${token}` };
  }

  async listRepos(apiBase: string, token: string): Promise<RepoItem[]> {
    const res = await firstValueFrom(
      this.httpService.get<GiteaRepoRaw[]>(`${apiBase}/user/repos`, {
        headers: this.authHeaders(token),
        params: { limit: 50 },
      }),
    );
    return (res.data ?? []).map((r) => this.toRepoItem(r));
  }

  async listBranches(
    apiBase: string,
    token: string,
    fullRepoName: string,
    defaultBranch: string,
  ): Promise<BranchItem[]> {
    const res = await firstValueFrom(
      this.httpService.get<GiteaBranchRaw[]>(
        `${apiBase}/repos/${fullRepoName}/branches`,
        { headers: this.authHeaders(token), params: { limit: 100 } },
      ),
    );
    return (res.data ?? []).map((b) => ({
      name: b.name,
      isDefault: b.name === defaultBranch,
      commitSha: b.commit?.id,
    }));
  }

  async listActionRuns(
    apiBase: string,
    token: string,
    fullRepoName: string,
  ): Promise<PipelineItem[]> {
    try {
      const res = await firstValueFrom(
        this.httpService.get<{ workflow_runs?: GiteaActionRunRaw[] } | GiteaActionRunRaw[]>(
          `${apiBase}/repos/${fullRepoName}/actions/tasks`,
          { headers: this.authHeaders(token), params: { limit: 30 } },
        ),
      );
      const runs = Array.isArray(res.data)
        ? res.data
        : (res.data?.workflow_runs ?? []);
      return runs.map((r) => this.toPipelineItem(r, fullRepoName, apiBase));
    } catch (error) {
      // Gitea Actions may be disabled on the instance — treat as "no runs".
      this.logger.debug(
        `actions/tasks unavailable for ${fullRepoName}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return [];
    }
  }

  async triggerWorkflow(
    apiBase: string,
    token: string,
    fullRepoName: string,
    branch: string,
    workflowFile = 'deploy.yml',
  ): Promise<PipelineItem> {
    await firstValueFrom(
      this.httpService.post(
        `${apiBase}/repos/${fullRepoName}/actions/workflows/${workflowFile}/dispatches`,
        { ref: branch },
        { headers: this.authHeaders(token) },
      ),
    );
    // Gitea dispatch returns 204 with no body — surface the latest run if the
    // instance exposes one, otherwise synthesize a queued placeholder.
    const runs = await this.listActionRuns(apiBase, token, fullRepoName);
    const latest = runs.find((r) => r.ref === branch);
    return (
      latest ?? {
        id: Date.now(),
        status: 'queued',
        ref: branch,
        sha: '',
        webUrl: `${apiBase.replace(/\/api\/v1$/, '')}/${fullRepoName}/actions`,
      }
    );
  }

  async readFile(
    apiBase: string,
    token: string,
    fullRepoName: string,
    filePath: string,
    ref?: string,
  ): Promise<string | null> {
    try {
      const res = await firstValueFrom(
        this.httpService.get<GiteaContentRaw>(
          `${apiBase}/repos/${fullRepoName}/contents/${encodeURIComponent(filePath)}`,
          { headers: this.authHeaders(token), params: ref ? { ref } : {} },
        ),
      );
      if (!res.data?.content) return null;
      return Buffer.from(res.data.content, 'base64').toString('utf-8');
    } catch {
      return null;
    }
  }

  /** Resolve the blob sha of a file if it exists (needed to update it). */
  private async getFileSha(
    apiBase: string,
    token: string,
    fullRepoName: string,
    filePath: string,
    branch: string,
  ): Promise<string | null> {
    try {
      const res = await firstValueFrom(
        this.httpService.get<GiteaContentRaw>(
          `${apiBase}/repos/${fullRepoName}/contents/${encodeURIComponent(filePath)}`,
          { headers: this.authHeaders(token), params: { ref: branch } },
        ),
      );
      return res.data?.sha ?? null;
    } catch {
      return null;
    }
  }

  /** Create or update a single file via the contents API. */
  async putFile(
    apiBase: string,
    token: string,
    fullRepoName: string,
    filePath: string,
    content: string,
    branch: string,
    message: string,
  ): Promise<'CREATED' | 'UPDATED'> {
    const sha = await this.getFileSha(apiBase, token, fullRepoName, filePath, branch);
    await firstValueFrom(
      this.httpService.put(
        `${apiBase}/repos/${fullRepoName}/contents/${encodeURIComponent(filePath)}`,
        {
          content: Buffer.from(content, 'utf-8').toString('base64'),
          message,
          branch,
          ...(sha ? { sha } : {}),
        },
        { headers: this.authHeaders(token) },
      ),
    );
    return sha ? 'UPDATED' : 'CREATED';
  }

  async createWebhook(
    apiBase: string,
    token: string,
    fullRepoName: string,
    webhookUrl: string,
    secret: string,
  ): Promise<WebhookConfigResult> {
    const res = await firstValueFrom(
      this.httpService.post<{ id: number }>(
        `${apiBase}/repos/${fullRepoName}/hooks`,
        {
          type: 'gitea',
          active: true,
          events: ['push', 'pull_request'],
          config: { url: webhookUrl, content_type: 'json', secret },
        },
        { headers: this.authHeaders(token) },
      ),
    );
    return { hookId: res.data?.id ?? 'unknown', url: webhookUrl };
  }

  async createIssueComment(
    apiBase: string,
    token: string,
    fullRepoName: string,
    issueNumber: string,
    body: string,
  ): Promise<void> {
    await firstValueFrom(
      this.httpService.post(
        `${apiBase}/repos/${fullRepoName}/issues/${issueNumber}/comments`,
        { body },
        { headers: this.authHeaders(token) },
      ),
    );
  }

  async verifyToken(apiBase: string, token: string): Promise<{ login: string }> {
    const res = await firstValueFrom(
      this.httpService.get<{ login: string }>(`${apiBase}/user`, {
        headers: this.authHeaders(token),
      }),
    );
    if (!res.data?.login) throw new BadRequestException('Token Gitea invalide');
    return res.data;
  }

  private toRepoItem(r: GiteaRepoRaw): RepoItem {
    return {
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      httpUrl: r.clone_url,
      defaultBranch: r.default_branch,
      description: r.description ?? null,
    };
  }

  private toPipelineItem(
    r: GiteaActionRunRaw,
    fullRepoName: string,
    apiBase: string,
  ): PipelineItem {
    const host = apiBase.replace(/\/api\/v1$/, '');
    return {
      id: r.id,
      status: r.status,
      ref: r.head_branch ?? r.ref ?? '',
      sha: r.head_sha ?? '',
      webUrl: r.html_url ?? `${host}/${fullRepoName}/actions`,
      createdAt: r.created_at ?? r.created,
    };
  }
}
