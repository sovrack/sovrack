import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Role, GitProviderType, SourceType } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../../core/database/prisma.service';
import { CryptoService } from '../../../../core/crypto/crypto.service';
import { sanitizeDockerTag } from '../../../../core/utils/docker-tag.util';
import { GitProviderConfigService } from '../../shared/connection/git-provider-config.service';
import { GithubClient } from './github.client';
import { GithubFileService } from './github-file.service';
import { GithubWebhookConfiguratorService } from './github-webhook-configurator.service';
import type {
  IGitProvider,
  RepoItem,
  BranchItem,
  PipelineItem,
  GitCredentials,
  RepoWriteResult,
  WebhookConfigResult,
} from '../../contracts/git-provider.contract';

export type ConnectGithubDto = {
  gitlabToken: string;
  repoPath: string;
  defaultBranch: string;
  providerId?: string;
  sourceType?: SourceType;
  registryUrl?: string | null;
};

@Injectable()
export class GithubAdapter implements IGitProvider {
  readonly type = 'GITHUB' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gitProviderRegistry: GitProviderConfigService,
    private readonly api: GithubClient,
    private readonly fileService: GithubFileService,
    private readonly webhookConfigurator: GithubWebhookConfiguratorService,
    private readonly crypto: CryptoService,
  ) {}

  async listRepos(projectId: string, userId: string, userRole: Role): Promise<RepoItem[]> {
    const { token, apiBase } = await this.resolveProjectCredentials(projectId);
    return this.api.listRepos(apiBase, token);
  }

  async listBranches(
    projectId: string,
    userId: string,
    userRole: Role,
    repoId?: string,
  ): Promise<BranchItem[]> {
    const { token, apiBase, fullRepoName, defaultBranch } =
      await this.resolveProjectCredentials(projectId, repoId);
    return this.api.listBranches(apiBase, token, fullRepoName, defaultBranch);
  }

  async listPipelines(projectId: string, userId: string, userRole: Role): Promise<PipelineItem[]> {
    const { token, apiBase, fullRepoName } =
      await this.resolveProjectCredentials(projectId);
    return this.api.listWorkflowRuns(apiBase, token, fullRepoName);
  }

  async triggerPipeline(
    projectId: string,
    branch: string,
    userId: string,
    userRole: Role,
    preferredRepoId?: number,
  ): Promise<PipelineItem> {
    const { token, apiBase, fullRepoName } =
      await this.resolveProjectCredentials(projectId);
    return this.api.triggerWorkflow(apiBase, token, fullRepoName, branch);
  }

  /**
   * Discover all repositories under a GitHub org (or user account) — the
   * GitHub counterpart of GitLab group discovery. The connection (apiBase
   * + token) is resolved from an existing provider config (`providerId`)
   * and/or a raw token, never from a project (discovery happens before any
   * repo is connected).
   */
  async discoverOrgRepos(
    owner: string,
    token?: string,
    providerId?: string,
  ): Promise<{ repoPath: string; name: string; defaultBranch: string }[]> {
    const conn = await this.resolveDiscoveryConnection(token, providerId);
    const repos = await this.api.listOrgRepos(conn.apiBase, conn.token, owner);
    return repos.map((r) => ({
      repoPath: r.fullName,
      name: r.name,
      defaultBranch: r.defaultBranch,
    }));
  }

  /**
   * Resolve a GitHub connection (apiBase + token) for discovery. Prefers
   * an explicit `providerId` (decrypts its OAuth/admin token + uses its
   * providerUrl for GHES support); otherwise uses the raw `token` against
   * public github.com.
   */
  private async resolveDiscoveryConnection(
    token?: string,
    providerId?: string,
  ): Promise<{ apiBase: string; token: string }> {
    if (providerId) {
      const provider = await this.prisma.gitProviderConfig.findUnique({
        where: { id: providerId },
      });
      if (!provider || provider.type !== GitProviderType.GITHUB) {
        throw new NotFoundException(`Provider GitHub ${providerId} introuvable`);
      }
      const adminToken = provider.adminToken
        ? await this.gitProviderRegistry.decryptProviderToken(provider.adminToken)
        : '';
      const oauthToken = provider.oauthAccessToken
        ? await this.gitProviderRegistry.decryptProviderToken(provider.oauthAccessToken)
        : '';
      const resolved = token || oauthToken || adminToken;
      if (!resolved) {
        throw new BadRequestException('Aucun token GitHub disponible pour ce provider');
      }
      return { apiBase: this.api.buildApiBase(provider.providerUrl), token: resolved };
    }

    if (!token) {
      throw new BadRequestException('Token GitHub requis pour la découverte');
    }
    return { apiBase: this.api.buildApiBase('https://github.com'), token };
  }

  // ─── IGitProvider (P3-#2) ────────────────────────────────────────────────
  // GitHub's registry model differs from GitLab's: the platform uses
  // GitHub Packages with the same PAT that authenticates the API. We
  // resolve the credentials from the GitHubProviderConfig linked to
  // the project and return them in the common shape.

  async resolveRegistryCredentials(
    projectId: string,
  ): Promise<{ username: string; password: string; registryUrl?: string | null }> {
    const { token } = await this.resolveProjectCredentials(projectId);
    // GitHub Packages uses the GitHub username as the registry username
    // and the PAT as the password. We don't know the username here
    // without a config row — return the token + the implied registry
    // URL. Callers that need a username can resolve it from
    // `GitProviderConfig.username`.
    return {
      username: 'oauth2',
      password: token,
      registryUrl: 'ghcr.io',
    };
  }

  async resolveRepositoryPath(
    projectId: string,
    _repoId?: number | string,
  ): Promise<string> {
    const { fullRepoName } = await this.resolveProjectCredentials(projectId);
    return fullRepoName;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async resolveProjectCredentials(
    projectId: string,
    repoId?: string,
  ): Promise<{
    token: string;
    apiBase: string;
    fullRepoName: string;
    defaultBranch: string;
  }> {
    const svc = await this.prisma.service.findFirst({
      where: { projectId, providerId: { not: null } },
      select: { providerId: true, repoPath: true, branch: true },
    });
    if (!svc?.providerId) {
      throw new NotFoundException('Projet non connecté à GitHub');
    }
    const gitProviderConfig = await this.prisma.gitProviderConfig.findUnique({
      where: { id: svc.providerId },
    });

    if (!gitProviderConfig || gitProviderConfig.type !== GitProviderType.GITHUB) {
      throw new NotFoundException('Projet non connecté à GitHub');
    }

    const provider = gitProviderConfig;
    const adminToken = provider.adminToken
      ? await this.gitProviderRegistry.decryptProviderToken(provider.adminToken)
      : '';
    const oauthToken = provider.oauthAccessToken
      ? await this.gitProviderRegistry.decryptProviderToken(provider.oauthAccessToken)
      : '';
    const token = oauthToken || adminToken;

    if (!token) {
      throw new BadRequestException('Aucun token GitHub configuré pour ce provider');
    }

    const apiBase = this.api.buildApiBase(provider.providerUrl);

    // If repoId is provided, look up the GitProviderRepo to get the full_name
    if (repoId) {
      const repoLink = await this.prisma.gitProviderRepo.findFirst({
        where: {
          providerId: provider.id,
          OR: [
            { id: repoId },
            { repoPath: repoId },
          ],
        },
      });
      if (repoLink) {
        return {
          token,
          apiBase,
          fullRepoName: repoLink.repoPath,
          defaultBranch: repoLink.defaultBranch,
        };
      }
    }

    // Fallback: extract from service.repoUrl
    const fullRepoName = this.extractFullRepoName(svc.repoPath ?? '');
    const defaultBranch = svc.branch ?? 'main';

    return { token, apiBase, fullRepoName, defaultBranch };
  }

  private extractFullRepoName(url: string): string {
    const match = url.match(/github\.com[:/]([^/]+\/[^/.]+)/);
    return match?.[1] ?? url;
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

  // ─── IGitProvider — Webhook configuration ────────────────────────────────

  async configureWebhook(
    projectId: string,
    webhookUrl: string,
    secret: string,
    _serviceId?: string,
  ): Promise<WebhookConfigResult> {
    return this.webhookConfigurator.configureWebhook(projectId, webhookUrl, secret);
  }

  // ─── IGitProvider — Git credentials for local VPS builds ─────────────────

  async resolveGitCredentials(projectId: string, _serviceId?: string): Promise<GitCredentials> {
    return this.fileService.resolveGitCredentials(projectId);
  }

  // ─── IGitProvider — Docker image reference ────────────────────────────────

  async resolveDockerImageRef(
    projectId: string,
    branch: string,
    _serviceId?: string,
  ): Promise<string> {
    const svc = await this.prisma.service.findFirst({
      where: { projectId, providerId: { not: null } },
      select: { repoPath: true, providerId: true },
    });
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });
     const slug = sanitizeDockerTag(project?.name ?? projectId);

     const tag = sanitizeDockerTag(branch);

    const gitProviderConfig = svc?.providerId
      ? await this.prisma.gitProviderConfig.findUnique({ where: { id: svc.providerId }, select: { providerUrl: true } })
      : null;

    const customRegistry = gitProviderConfig?.providerUrl?.trim()
      ? gitProviderConfig.providerUrl.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
      : null;

    const registry = customRegistry ?? 'ghcr.io';
    const repoName = this.extractFullRepoName(svc?.repoPath ?? '').toLowerCase() || slug;

    return `${registry}/${repoName}:${tag}`;
  }

  // ─── Connect project (unified /source/connect) ─────────────────────────────

  async connectProject(
    projectId: string,
    dto: ConnectGithubDto,
  ): Promise<{ id: string; repoPath: string; defaultBranch: string }> {
    const repoName = dto.repoPath.replace(/^https?:\/\/[^/]+\//, '').replace(/\.git$/, '');
    const repoUrl = `https://github.com/${repoName}.git`;
    const defaultBranch = dto.defaultBranch || 'main';
    const sourceType = dto.sourceType ?? SourceType.GIT;

    // Find or create environment for the project
    let env = await this.prisma.environment.findFirst({ where: { projectId } });
    if (!env) {
      env = await this.prisma.environment.create({
        data: { name: 'production', projectId },
      });
    }

    // Upsert a service at project level (M3)
    const existingSvc = await this.prisma.service.findFirst({
      where: { projectId, providerId: dto.providerId ?? undefined },
    });

    const svc = await this.prisma.service.upsert({
      where: { id: existingSvc?.id ?? '00000000-0000-0000-0000-000000000000' },
      update: {
        repoPath: repoUrl,
        branch: defaultBranch,
        sourceType,
        providerId: dto.providerId ?? null,
      },
      create: {
        name: repoName.split('/').pop() ?? repoName,
        type: 'APPLICATION' as any,
        projectId,
        repoPath: repoUrl,
        branch: defaultBranch,
        sourceType,
        providerId: dto.providerId ?? null,
      },
    });

    // Auto-link the service to the environment
    const existingLink = await this.prisma.serviceEnvironment.findFirst({
      where: { serviceId: svc.id, environmentId: env.id },
    });
    if (!existingLink) {
      await this.prisma.serviceEnvironment.create({
        data: { serviceId: svc.id, environmentId: env.id },
      });
    }

    return { id: projectId, repoPath: repoUrl, defaultBranch };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────


}
