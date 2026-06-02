import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Role, GitProviderType } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { GitProviderConfigService } from '../config/git-provider-config.service';
import { GithubApiService } from './github-api.service';
import { GithubWebhookService } from './github-webhook.service';
import type {
  IGitProvider,
  RepoItem,
  BranchItem,
  PipelineItem,
  WebhookResult,
} from '../interfaces/git-provider.interface';

@Injectable()
export class GithubService implements IGitProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gitProviderRegistry: GitProviderConfigService,
    private readonly api: GithubApiService,
    private readonly webhookService: GithubWebhookService,
  ) {}

  async listRepos(projectId: string, userId: string, userRole: Role): Promise<RepoItem[]> {
    const { token, apiBase } = await this.resolveProjectCredentials(projectId);
    return this.api.listRepos(apiBase, token);
  }

  async listBranches(projectId: string, userId: string, userRole: Role): Promise<BranchItem[]> {
    const { token, apiBase, fullRepoName, defaultBranch } =
      await this.resolveProjectCredentials(projectId);
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
    const rawBody = typeof payload === 'object' ? JSON.stringify(payload) : String(payload ?? '');
    await this.webhookService.verifyWebhookSignature(token, rawBody);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async resolveProjectCredentials(projectId: string): Promise<{
    token: string;
    apiBase: string;
    fullRepoName: string;
    defaultBranch: string;
  }> {
    const gitlabConfig = await this.prisma.gitlabConfig.findUnique({
      where: { projectId },
      include: { provider: true },
    });

    if (!gitlabConfig?.provider || gitlabConfig.provider.type !== GitProviderType.GITHUB) {
      throw new NotFoundException('Projet non connecté à GitHub');
    }

    const provider = gitlabConfig.provider;
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

    // fullRepoName is stored in the project's gitlabUrl or derived from gitlabId
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { gitlabUrl: true, branch: true },
    });

    const fullRepoName = this.extractFullRepoName(project?.gitlabUrl ?? '', apiBase);
    const defaultBranch = gitlabConfig.defaultBranch ?? project?.branch ?? 'main';

    return { token, apiBase, fullRepoName, defaultBranch };
  }

  private extractFullRepoName(projectUrl: string, apiBase: string): string {
    // Extract owner/repo from clone URL or project URL
    // e.g. https://github.com/owner/repo → owner/repo
    const match = projectUrl.match(/github\.com[:/]([^/]+\/[^/\.]+)/);
    return match?.[1] ?? projectUrl;
  }
}
