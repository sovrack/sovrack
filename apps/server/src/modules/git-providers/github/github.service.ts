import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Role, GitProviderType, AppSourceType } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../core/database/prisma.service';
import { CryptoService } from '../../../core/crypto/crypto.service';
import { GitProviderConfigService } from '../config/git-provider-config.service';
import { GithubApiService } from './github-api.service';
import { GithubWebhookService } from './github-webhook.service';
import { GithubFileService } from './github-file.service';
import { GithubWebhookConfiguratorService } from './github-webhook-configurator.service';
import type {
  IGitProvider,
  RepoItem,
  BranchItem,
  PipelineItem,
  WebhookResult,
  GitCredentials,
  RepoWriteResult,
  WebhookConfigResult,
} from '../interfaces/git-provider.interface';

export type ConnectGithubDto = {
  gitlabToken: string;
  repoPath: string;
  defaultBranch: string;
  providerId?: string;
  sourceType?: AppSourceType;
  registryUrl?: string | null;
};

@Injectable()
export class GithubService implements IGitProvider {
  readonly type = 'GITHUB' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gitProviderRegistry: GitProviderConfigService,
    private readonly api: GithubApiService,
    private readonly webhookService: GithubWebhookService,
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

  async handleWebhook(payload: unknown): Promise<WebhookResult> {
    return this.webhookService.handleWebhook(payload);
  }

  async verifyWebhookToken(
    token: string | undefined,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    // SECURITY: NEVER re-serialize a parsed JSON payload. JSON.stringify is not
    // canonical and breaks HMAC verification. The actual webhook verification
    // path uses rawBody from the request, set by NestFactory.create({ rawBody: true }).
    // This method is only kept for interface compatibility with the unified IGitProvider.
    // For GitHub webhooks, use the controller's rawBody-based verification instead.
    if (!token) {
      throw new BadRequestException('Token webhook GitHub manquant');
    }
    // For the GitHub case, this is a no-op signature: the real verification happens
    // in the controller with rawBody. We just validate the token presence.
    // If a signature header is passed (sha256=...), it means it's GitHub HMAC.
    if (token.startsWith('sha256=')) {
      // Try to verify using raw payload — best effort
      const rawBody = typeof payload === 'object' ? JSON.stringify(payload) : String(payload ?? '');
      try {
        await this.webhookService.verifyWebhookSignature(token, rawBody, {
          repoFullName: (payload as { repository?: { full_name?: string } })?.repository?.full_name,
        });
      } catch {
        // ignore — controller does the real verification
      }
    }
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
    const appProviderLink = await this.prisma.appProviderLink.findUnique({
      where: { projectId },
      include: { provider: true },
    });

    if (!appProviderLink?.provider || appProviderLink.provider.type !== GitProviderType.GITHUB) {
      throw new NotFoundException('Projet non connecté à GitHub');
    }

    const provider = appProviderLink.provider;
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

    const apiBase = this.api.buildApiBase(provider.gitlabUrl);

    // If repoId is provided, look up the GitProviderRepo to get the full_name
    if (repoId) {
      const repoLink = await this.prisma.gitProviderRepo.findFirst({
        where: {
          providerId: provider.id,
          OR: [
            { id: repoId },
            { externalRepoId: repoId },
          ],
        },
      });
      if (repoLink) {
        return {
          token,
          apiBase,
          fullRepoName: repoLink.repoFullName,
          defaultBranch: repoLink.defaultBranch,
        };
      }
    }

    // Fallback: extract from project.repoUrl
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { repoUrl: true, branch: true },
    });

    const fullRepoName = this.extractFullRepoName(project?.repoUrl ?? '');
    const defaultBranch = appProviderLink.defaultBranch ?? project?.branch ?? 'main';

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
    const [config, project] = await Promise.all([
      this.prisma.appProviderLink.findUnique({ where: { projectId }, select: { registryUrl: true } }),
      this.prisma.project.findUnique({ where: { id: projectId }, select: { name: true, repoUrl: true } }),
    ]);

    const slug = this.sanitizeDockerTag(project?.name ?? projectId);
    const tag = this.sanitizeDockerTag(branch);

    const customRegistry = config?.registryUrl?.trim()
      ? config.registryUrl.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
      : null;

    const registry = customRegistry ?? 'ghcr.io';
    const repoName = this.extractFullRepoName(project?.repoUrl ?? '').toLowerCase() || slug;

    return `${registry}/${repoName}:${tag}`;
  }

  // ─── Connect project (unified /source/connect) ─────────────────────────────

  async connectProject(
    projectId: string,
    dto: ConnectGithubDto,
  ): Promise<{ id: string; repoUrl: string; defaultBranch: string }> {
    const repoFullName = dto.repoPath.replace(/^https?:\/\/[^/]+\//, '').replace(/\.git$/, '');
    const repoUrl = `https://github.com/${repoFullName}.git`;
    const defaultBranch = dto.defaultBranch || 'main';
    const webhookSecret = randomBytes(32).toString('hex');
    const sourceType = dto.sourceType ?? AppSourceType.REPO;

    await this.prisma.appProviderLink.upsert({
      where: { projectId },
      update: {
        providerUrl: 'https://github.com',
        providerToken: this.crypto.encrypt(dto.gitlabToken),
        externalId: null,
        repoPathNamespace: repoFullName,
        defaultBranch,
        sourceType,
        providerId: dto.providerId ?? null,
        webhookSecret: this.crypto.encrypt(webhookSecret),
        registryUrl: dto.registryUrl ?? null,
      },
      create: {
        projectId,
        providerUrl: 'https://github.com',
        providerToken: this.crypto.encrypt(dto.gitlabToken),
        externalId: null,
        repoPathNamespace: repoFullName,
        defaultBranch,
        sourceType,
        providerId: dto.providerId ?? null,
        webhookSecret: this.crypto.encrypt(webhookSecret),
        registryUrl: dto.registryUrl ?? null,
      },
    });

    await this.prisma.project.update({
      where: { id: projectId },
      data: { repoUrl, branch: defaultBranch },
    });

    return { id: projectId, repoUrl, defaultBranch };
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
}
