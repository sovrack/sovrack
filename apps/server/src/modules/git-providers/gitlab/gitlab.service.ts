import { Injectable } from '@nestjs/common';
import { Role, type GitlabConfig } from '@prisma/client';
import type { IGitProvider, RepoItem, BranchItem, PipelineItem, WebhookResult } from '../interfaces/git-provider.interface';
import { ConnectGitlabDto } from './dto/connect-gitlab.dto';
import {
  GitlabBranchItem,
  GitlabGroupRepositoriesPage,
  GitlabGroupRepositoriesQuery,
  GitlabPipelineItem,
  GitlabRepoItem,
} from './gitlab-api.service';
import { PublicGitlabConfig } from './gitlab-crypto.service';
import { GitlabCiService } from './gitlab-ci.service';
import { GitlabCoreService } from './gitlab-core.service';
import { GitlabWebhookPayload } from './gitlab-webhook.service';
import { type GitlabProviderProjectOption } from '../config/git-provider-config.service';

@Injectable()
export class GitlabService implements IGitProvider {
  constructor(
    private readonly core: GitlabCoreService,
    private readonly ci: GitlabCiService,
  ) {}

  async connectProject(
    projectId: string,
    dto: ConnectGitlabDto,
    userId: string,
    userRole: Role,
  ): Promise<PublicGitlabConfig> {
    return await this.core.connectProject(projectId, dto, userId, userRole);
  }

  async verifyConnectionInput(dto: ConnectGitlabDto): Promise<void> {
    return await this.core.verifyConnectionInput(dto);
  }

  async getBranches(
    projectId: string,
    userId: string,
    userRole: Role,
    preferredRepoId?: number,
  ): Promise<GitlabBranchItem[]> {
    return await this.core.getBranches(
      projectId,
      userId,
      userRole,
      preferredRepoId,
    );
  }

  async getPipelines(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabPipelineItem[]> {
    return await this.ci.getPipelines(projectId, userId, userRole);
  }

  async getPipelinesForService(
    projectId: string,
    serviceId: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabPipelineItem[]> {
    return await this.ci.getPipelinesForService(
      projectId,
      serviceId,
      userId,
      userRole,
    );
  }

  async triggerPipeline(
    projectId: string,
    branch: string,
    userId: string,
    userRole: Role,
    preferredRepoId?: number,
  ): Promise<PipelineItem> {
    const raw = await this.ci.triggerPipeline(
      projectId,
      branch,
      userId,
      userRole,
      preferredRepoId,
    );
    return { id: raw.id, status: raw.status, ref: raw.ref, sha: raw.sha, webUrl: raw.web_url };
  }

  async getRepos(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabRepoItem[]> {
    return await this.core.getRepos(projectId, userId, userRole);
  }

  async listAvailableProviders(): Promise<GitlabProviderProjectOption[]> {
    return await this.core.listAvailableProviders();
  }

  async listGroupRepositoriesByProvider(params: {
    providerId?: string;
    gitlabUrl?: string;
    gitlabToken?: string;
    groupId: string;
    query?: GitlabGroupRepositoriesQuery;
  }): Promise<GitlabGroupRepositoriesPage> {
    return await this.core.listGroupRepositoriesByProvider(params);
  }

  async listProjectBranchesByProvider(params: {
    providerId?: string;
    gitlabUrl?: string;
    gitlabToken?: string;
    projectId: string;
  }): Promise<GitlabBranchItem[]> {
    return await this.core.listProjectBranchesByProvider(params);
  }

  async handleWebhook(payload: unknown): Promise<WebhookResult> {
    return await this.core.handleWebhook(payload as GitlabWebhookPayload);
  }

  async getGitlabConfig(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<PublicGitlabConfig> {
    return await this.core.getGitlabConfig(projectId, userId, userRole);
  }

  async verifyWebhookToken(
    token?: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    return await this.core.verifyWebhookToken(token, payload);
  }

  // ─── IGitProvider interface adapters ──────────────────────────────────────

  async listRepos(projectId: string, userId: string, userRole: Role): Promise<RepoItem[]> {
    const raw = await this.getRepos(projectId, userId, userRole);
    return raw.map((r) => ({
      id: Number(r.id ?? 0),
      name: r.name ?? r.path ?? '',
      fullName: r.path_with_namespace ?? r.pathWithNamespace ?? r.name ?? '',
      httpUrl: r.web_url ?? r.webUrl ?? '',
      defaultBranch: r.default_branch ?? r.defaultBranch ?? 'main',
      description: r.description ?? null,
    }));
  }

  async listBranches(projectId: string, userId: string, userRole: Role): Promise<BranchItem[]> {
    const raw = await this.getBranches(projectId, userId, userRole);
    return raw.map((b) => {
      const branch = b as Record<string, unknown>;
      return {
        name: String(branch['name'] ?? ''),
        isDefault: Boolean(branch['default'] ?? false),
        commitSha: String((branch['commit'] as Record<string,unknown>)?.['id'] ?? ''),
      };
    });
  }

  async listPipelines(projectId: string, userId: string, userRole: Role): Promise<PipelineItem[]> {
    const raw = await this.ci.getPipelines(projectId, userId, userRole);
    return raw.map((p) => ({
      id: p.id,
      status: p.status,
      ref: p.ref,
      sha: p.sha,
      webUrl: p.web_url,
    }));
  }

  resolveRegistryCredentials(config: GitlabConfig) {
    return this.core.resolveRegistryCredentials(config);
  }

  async resolveRepositoryPath(
    config: GitlabConfig,
    fallbackProjectSlug: string,
    preferredRepoId?: number,
  ) {
    return await this.core.resolveRepositoryPath(
      config,
      fallbackProjectSlug,
      preferredRepoId,
    );
  }
}
