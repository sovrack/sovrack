import { Injectable, NotFoundException } from '@nestjs/common';
import { Role, type AppProviderLink } from '@prisma/client';
import type {
  IGitProvider,
  RepoItem,
  BranchItem,
  PipelineItem,
  WebhookResult,
  RegistryCredentials,
  GitCredentials,
  RepoWriteResult,
  WebhookConfigResult,
} from '../interfaces/git-provider.interface';
import { PrismaService } from '../../../core/database/prisma.service';
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
import { GitlabFileService } from './gitlab-file.service';
import { GitlabWebhookConfiguratorService } from './gitlab-webhook-configurator.service';

@Injectable()
export class GitlabService implements IGitProvider {
  readonly type = 'GITLAB' as const;

  constructor(
    private readonly core: GitlabCoreService,
    private readonly ci: GitlabCiService,
    private readonly prisma: PrismaService,
    private readonly fileService: GitlabFileService,
    private readonly webhookConfigurator: GitlabWebhookConfiguratorService,
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

  // ─── Internal: config-based primitives (P3-#2 kept for back-compat) ─────
  // These take a `GitlabConfig` row directly. Used by callers that
  // already have the config in scope (legacy paths, tests). New code
  // should prefer the IGitProvider-shaped `resolveRegistryCredentials(projectId)`
  // and `resolveRepositoryPath(projectId, repoId?)` below.

  resolveRegistryCredentialsFromConfig(config: AppProviderLink) {
    return this.core.resolveRegistryCredentials(config);
  }

  async resolveRepositoryPathFromConfig(
    config: AppProviderLink,
    fallbackProjectSlug: string,
    preferredRepoId?: number,
  ) {
    return await this.core.resolveRepositoryPath(
      config,
      fallbackProjectSlug,
      preferredRepoId,
    );
  }

  // ─── IGitProvider (projectId-based, P3-#2) ──────────────────────────────
  // Cross-cutting services (docker-image, deployments-ansible) should
  // use these to stay provider-agnostic. The IGitProvider contract is
  // `projectId`-based: each provider resolves its own config internally.

  async resolveRegistryCredentials(
    projectId: string,
  ): Promise<RegistryCredentials> {
    const config = await this.prisma.appProviderLink.findUnique({
      where: { projectId },
    });
    if (!config) {
      throw new NotFoundException(
        `Aucune config GitLab pour le projet ${projectId}`,
      );
    }
    return this.core.resolveRegistryCredentials(config);
  }

  async resolveRepositoryPath(
    projectId: string,
    preferredRepoId?: number | string,
  ): Promise<string> {
    const config = await this.prisma.appProviderLink.findUnique({
      where: { projectId },
    });
    if (!config) {
      throw new NotFoundException(
        `Aucune config GitLab pour le projet ${projectId}`,
      );
    }
    return this.core.resolveRepositoryPath(
      config,
      config.defaultBranch,
      typeof preferredRepoId === 'string'
        ? Number(preferredRepoId)
        : preferredRepoId,
    );
  }

  // ─── IGitProvider — File operations ───────────────────────────────────────

  async readFile(projectId: string, filePath: string, ref?: string): Promise<string | null> {
    return this.fileService.readFile(projectId, filePath, ref);
  }

  async writeFiles(
    projectId: string,
    files: Record<string, string>,
    serviceId?: string,
  ): Promise<RepoWriteResult> {
    return this.fileService.writeFiles(projectId, files, serviceId);
  }

  // ─── IGitProvider — Webhook configuration (owned by projects module) ──────

  async configureWebhook(
    projectId: string,
    webhookUrl: string,
    secret: string,
    serviceId?: string,
  ): Promise<WebhookConfigResult> {
    return this.webhookConfigurator.configureWebhook(projectId, webhookUrl, secret, serviceId);
  }

  // ─── IGitProvider — Git credentials for local VPS builds ─────────────────

  async resolveGitCredentials(projectId: string, serviceId?: string): Promise<GitCredentials> {
    return this.fileService.resolveGitCredentials(projectId, serviceId);
  }

  // ─── IGitProvider — Docker image reference ────────────────────────────────

  async resolveDockerImageRef(
    projectId: string,
    branch: string,
    serviceId?: string,
  ): Promise<string> {
    const config = await this.prisma.appProviderLink.findUnique({ where: { projectId } });
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, repoUrl: true },
    });

    const slug = this.sanitizeDockerTag(project?.name ?? projectId);
    const tag = this.sanitizeDockerTag(branch);

    if (!config) return `${slug}:${tag}`;

    let preferredRepoId: number | undefined;
    let projectSlug = slug;
    if (serviceId) {
      const svc = await this.prisma.projectService.findUnique({
        where: { id: serviceId },
        select: { externalRepoId: true, name: true },
      });
      if (svc?.externalRepoId) preferredRepoId = Number(svc.externalRepoId);
      if (svc?.name) projectSlug = `${slug}-${this.sanitizeDockerTag(svc.name)}`;
    }

    const registryHost = this.resolveRegistryHost(config.registryUrl, config.providerUrl);
    const repoPath = await this.core.resolveRepositoryPath(config, projectSlug, preferredRepoId);
    const finalPath =
      this.isPlaceholderPath(config, repoPath) && project?.repoUrl
        ? (this.extractPathFromUrl(project.repoUrl) ?? repoPath)
        : repoPath;

    return `${registryHost}/${finalPath}:${tag}`;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private sanitizeDockerTag(value: string): string {
    return (
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'latest'
    );
  }

  private resolveRegistryHost(
    registryUrl: string | null | undefined,
    gitlabUrl: string,
  ): string {
    if (registryUrl?.trim()) return this.cleanHost(registryUrl);
    try {
      const { hostname, port, host } = new URL(gitlabUrl);
      if (hostname.toLowerCase() === 'gitlab.com') return 'registry.gitlab.com';
      return port ? host : `${hostname}:5050`;
    } catch {
      return this.cleanHost(gitlabUrl);
    }
  }

  private cleanHost(v: string): string {
    return v.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  }

  private extractPathFromUrl(url: string): string | null {
    try {
      const path = new URL(url).pathname
        .replace(/^\/+/, '')
        .replace(/\/+$/, '')
        .replace(/\.git$/i, '');
      return path || null;
    } catch {
      return null;
    }
  }

  private isPlaceholderPath(
    config: { externalId?: bigint | null; externalGroupId?: bigint | null; sourceType?: import('@prisma/client').AppSourceType | null },
    path: string,
  ): boolean {
    if (config.externalId && path.startsWith(`project-${String(config.externalId)}/`)) return true;
    if (config.externalGroupId && path.startsWith(`group-${String(config.externalGroupId)}/`)) return true;
    return false;
  }
}
