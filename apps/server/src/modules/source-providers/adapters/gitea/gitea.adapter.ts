import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Role, GitProviderType } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import { sanitizeDockerTag } from '../../../../core/utils/docker-tag.util';
import { GitProviderConfigService } from '../../shared/connection/git-provider-config.service';
import { GiteaClient } from './gitea.client';
import type {
  IGitProvider,
  RepoItem,
  BranchItem,
  PipelineItem,
  GitCredentials,
  RegistryCredentials,
  RepoWriteResult,
  WebhookConfigResult,
} from '../../contracts/git-provider.contract';

type GiteaConnection = {
  token: string;
  apiBase: string;
  host: string;
  fullRepoName: string;
  defaultBranch: string;
  username: string;
};

/**
 * Gitea provider — speaks the Gitea REST API (`/api/v1`) through GiteaClient.
 * Mirrors the GitHub adapter: the provider is linked to a SERVICE
 * (service.providerId → GitProviderConfig of type GITEA), and all credentials
 * are resolved from that config's encrypted token.
 */
@Injectable()
export class GiteaAdapter implements IGitProvider {
  readonly type = GitProviderType.GITEA;

  // The CI config file is never written automatically (users own their CI).
  private static readonly DEFAULT_WORKFLOW = 'deploy.yml';

  constructor(
    private readonly prisma: PrismaService,
    private readonly gitProviderConfig: GitProviderConfigService,
    private readonly api: GiteaClient,
  ) {}

  async listRepos(projectId: string, _userId: string, _userRole: Role): Promise<RepoItem[]> {
    const { apiBase, token } = await this.resolveConnection(projectId);
    return this.api.listRepos(apiBase, token);
  }

  async listBranches(projectId: string, _userId: string, _userRole: Role): Promise<BranchItem[]> {
    const { apiBase, token, fullRepoName, defaultBranch } = await this.resolveConnection(projectId);
    return this.api.listBranches(apiBase, token, fullRepoName, defaultBranch);
  }

  async listPipelines(projectId: string, _userId: string, _userRole: Role): Promise<PipelineItem[]> {
    const { apiBase, token, fullRepoName } = await this.resolveConnection(projectId);
    return this.api.listActionRuns(apiBase, token, fullRepoName);
  }

  async triggerPipeline(
    projectId: string,
    branch: string,
    _userId: string,
    _userRole: Role,
    _preferredRepoId?: number,
  ): Promise<PipelineItem> {
    const { apiBase, token, fullRepoName } = await this.resolveConnection(projectId);
    return this.api.triggerWorkflow(apiBase, token, fullRepoName, branch, GiteaAdapter.DEFAULT_WORKFLOW);
  }

  async resolveRepositoryPath(projectId: string, _repoId?: number | string): Promise<string> {
    const { fullRepoName } = await this.resolveConnection(projectId);
    return fullRepoName;
  }

  async readFile(projectId: string, filePath: string, ref?: string): Promise<string | null> {
    const { apiBase, token, fullRepoName } = await this.resolveConnection(projectId);
    return this.api.readFile(apiBase, token, fullRepoName, filePath, ref);
  }

  async writeFiles(
    projectId: string,
    files: Record<string, string>,
    _serviceId?: string,
  ): Promise<RepoWriteResult> {
    const { apiBase, token, fullRepoName, defaultBranch } = await this.resolveConnection(projectId);
    const fileStatuses: Record<string, 'CREATED' | 'UPDATED' | 'SKIPPED'> = {};
    for (const [path, content] of Object.entries(files)) {
      // Never overwrite the workflow file — users own their CI definition.
      if (path.startsWith('.gitea/workflows/') || path.startsWith('.github/workflows/')) {
        fileStatuses[path] = 'SKIPPED';
        continue;
      }
      fileStatuses[path] = await this.api.putFile(
        apiBase,
        token,
        fullRepoName,
        path,
        content,
        defaultBranch,
        `chore: update ${path} via platform`,
      );
    }
    return { branch: defaultBranch, fileStatuses };
  }

  async configureWebhook(
    projectId: string,
    webhookUrl: string,
    secret: string,
    _serviceId?: string,
  ): Promise<WebhookConfigResult> {
    const { apiBase, token, fullRepoName } = await this.resolveConnection(projectId);
    return this.api.createWebhook(apiBase, token, fullRepoName, webhookUrl, secret);
  }

  async resolveRegistryCredentials(projectId: string): Promise<RegistryCredentials> {
    const { token, host, username } = await this.resolveConnection(projectId);
    // Gitea ships an OCI-compatible package registry on the same host; it
    // authenticates with the user's name + a token.
    return { username, password: token, registryUrl: host };
  }

  async resolveDockerImageRef(
    projectId: string,
    branch: string,
    _serviceId?: string,
  ): Promise<string> {
    const { host, fullRepoName } = await this.resolveConnection(projectId);
    const tag = sanitizeDockerTag(branch);
    return `${host}/${fullRepoName.toLowerCase()}:${tag}`;
  }

  async resolveGitCredentials(projectId: string, _serviceId?: string): Promise<GitCredentials> {
    const { token, host, fullRepoName } = await this.resolveConnection(projectId);
    return { repoUrl: `https://${host}/${fullRepoName}.git`, token };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async resolveConnection(projectId: string): Promise<GiteaConnection> {
    const svc = await this.prisma.service.findFirst({
      where: { projectId, providerId: { not: null } },
      select: { providerId: true, repoPath: true, branch: true },
    });
    if (!svc?.providerId) {
      throw new NotFoundException('Projet non connecté à Gitea');
    }
    const provider = await this.prisma.gitProviderConfig.findUnique({
      where: { id: svc.providerId },
    });
    if (!provider || provider.type !== GitProviderType.GITEA) {
      throw new NotFoundException('Projet non connecté à Gitea');
    }

    const token = provider.oauthAccessToken
      ? this.gitProviderConfig.decryptProviderToken(provider.oauthAccessToken)
      : provider.adminToken
        ? this.gitProviderConfig.decryptProviderToken(provider.adminToken)
        : '';
    if (!token) {
      throw new BadRequestException('Aucun token Gitea configuré pour ce provider');
    }

    const apiBase = this.api.buildApiBase(provider.providerUrl);
    const host = provider.providerUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

    return {
      token,
      apiBase,
      host,
      fullRepoName: this.extractFullRepoName(svc.repoPath ?? '', host),
      defaultBranch: svc.branch ?? 'main',
      username: provider.name,
    };
  }

  /** Extract `owner/repo` from a stored repo URL or path. */
  private extractFullRepoName(repoPath: string, host: string): string {
    const escapedHost = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = repoPath.match(new RegExp(`${escapedHost}[:/]([^/]+/[^/.]+)`, 'i'));
    return match?.[1] ?? repoPath.replace(/\.git$/, '');
  }
}
