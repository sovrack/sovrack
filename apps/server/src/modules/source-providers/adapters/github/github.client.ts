import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import type {
  RepoItem,
  BranchItem,
  PipelineItem,
} from '../../contracts/git-provider.contract';

type GithubRepoRaw = {
  id: number;
  name: string;
  full_name: string;
  clone_url: string;
  default_branch: string;
  description?: string | null;
};

type GithubBranchRaw = {
  name: string;
  commit: { sha: string };
};

type GithubWorkflowRun = {
  id: number;
  status: string;
  conclusion: string | null;
  head_branch: string;
  head_sha: string;
  html_url: string;
  created_at: string;
};

@Injectable()
export class GithubClient {
  private readonly logger = new Logger(GithubClient.name);

  constructor(private readonly httpService: HttpService) {}

  buildApiBase(providerUrl: string): string {
    const url = providerUrl.replace(/\/+$/, '');
    if (url === 'https://github.com' || url === 'http://github.com') {
      return 'https://api.github.com';
    }
    // GitHub Enterprise Server
    return `${url}/api/v3`;
  }

  async listRepos(apiBase: string, token: string): Promise<RepoItem[]> {
    const repos = await this.fetchAllPages(`${apiBase}/user/repos`, token, {
      sort: 'updated',
    });
    return repos.map((r) => this.toRepoItem(r));
  }

  /**
   * List all repositories under a GitHub org (or user account) — the
   * GitHub equivalent of a GitLab "group discovery". `owner` may be an
   * organisation or a user login: we try `/orgs/:owner/repos` first and
   * fall back to `/users/:owner/repos` on 404 (GitHub returns 404 for an
   * org endpoint when `owner` is actually a personal account).
   */
  async listOrgRepos(
    apiBase: string,
    token: string,
    owner: string,
  ): Promise<RepoItem[]> {
    const path = encodeURIComponent(owner);
    let raw: GithubRepoRaw[];
    try {
      raw = await this.fetchAllPages(`${apiBase}/orgs/${path}/repos`, token, {
        type: 'all',
        sort: 'updated',
      });
    } catch (error) {
      // Org not found → maybe `owner` is a user account, not an org.
      this.logger.debug(
        `orgs/${owner}/repos failed, falling back to users/${owner}/repos: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      raw = await this.fetchAllPages(`${apiBase}/users/${path}/repos`, token, {
        type: 'owner',
        sort: 'updated',
      });
    }
    return raw.map((r) => this.toRepoItem(r));
  }

  private async fetchAllPages(
    url: string,
    token: string,
    params: Record<string, string | number> = {},
  ): Promise<GithubRepoRaw[]> {
    const repos: GithubRepoRaw[] = [];
    let page = 1;
    while (true) {
      const res = await firstValueFrom(
        this.httpService.get<GithubRepoRaw[]>(url, {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 100, page, ...params },
        }),
      );
      if (!res.data?.length) break;
      repos.push(...res.data);
      if (res.data.length < 100) break;
      page++;
    }
    return repos;
  }

  private toRepoItem(r: GithubRepoRaw): RepoItem {
    return {
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      httpUrl: r.clone_url,
      defaultBranch: r.default_branch,
      description: r.description ?? null,
    };
  }

  async listBranches(
    apiBase: string,
    token: string,
    fullRepoName: string,
    defaultBranch: string,
  ): Promise<BranchItem[]> {
    const res = await firstValueFrom(
      this.httpService.get<GithubBranchRaw[]>(
        `${apiBase}/repos/${fullRepoName}/branches`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 100 },
        },
      ),
    );

    return (res.data ?? []).map((b) => ({
      name: b.name,
      isDefault: b.name === defaultBranch,
      commitSha: b.commit.sha,
    }));
  }

  async listWorkflowRuns(
    apiBase: string,
    token: string,
    fullRepoName: string,
  ): Promise<PipelineItem[]> {
    const res = await firstValueFrom(
      this.httpService.get<{ workflow_runs: GithubWorkflowRun[] }>(
        `${apiBase}/repos/${fullRepoName}/actions/runs`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 30 },
        },
      ),
    );

    return (res.data?.workflow_runs ?? []).map((r) => ({
      id: r.id,
      status: r.conclusion ?? r.status,
      ref: r.head_branch,
      sha: r.head_sha,
      webUrl: r.html_url,
      createdAt: r.created_at,
    }));
  }

  async triggerWorkflow(
    apiBase: string,
    token: string,
    fullRepoName: string,
    branch: string,
    workflowFile = 'deploy.yml',
  ): Promise<PipelineItem> {
    // Trigger the workflow dispatch event
    await firstValueFrom(
      this.httpService.post(
        `${apiBase}/repos/${fullRepoName}/actions/workflows/${workflowFile}/dispatches`,
        { ref: branch },
        { headers: { Authorization: `Bearer ${token}` } },
      ),
    );

    // GitHub dispatch returns 204 with no body — fetch the latest run
    await this.sleep(2000); // Brief wait for GitHub to register the run
    const runs = await this.listWorkflowRuns(apiBase, token, fullRepoName);
    const latest = runs.find((r) => r.ref === branch);

    return (
      latest ?? {
        id: Date.now(),
        status: 'queued',
        ref: branch,
        sha: '',
        webUrl: `https://github.com/${fullRepoName}/actions`,
      }
    );
  }

  async verifyToken(
    apiBase: string,
    token: string,
  ): Promise<{ login: string; name: string }> {
    const res = await firstValueFrom(
      this.httpService.get<{ login: string; name: string }>(`${apiBase}/user`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    if (!res.data?.login)
      throw new BadRequestException('Token GitHub invalide');
    return res.data;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
