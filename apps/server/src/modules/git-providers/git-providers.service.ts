import { Injectable, NotFoundException } from '@nestjs/common';
import { GitProviderType } from '@prisma/client';
import { Role } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { GitlabService } from './gitlab/gitlab.service';
import { GithubService } from './github/github.service';
import type {
  IGitProvider,
  RepoItem,
  BranchItem,
  PipelineItem,
  WebhookResult,
} from './interfaces/git-provider.interface';

/**
 * Point d'entrée unifié pour les opérations Git.
 * Délègue automatiquement vers GitLab ou GitHub selon la config du projet.
 *
 * Usage:
 *   const provider = await this.gitProviders.forProject(projectId);
 *   const branches = await provider.listBranches(projectId, userId, userRole);
 */
@Injectable()
export class GitProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gitlab: GitlabService,
    private readonly github: GithubService,
  ) {}

  /**
   * Résout le provider approprié pour un projet donné.
   */
  async forProject(projectId: string): Promise<IGitProvider> {
    const config = await this.prisma.gitlabConfig.findUnique({
      where: { projectId },
      include: { provider: { select: { type: true } } },
    });

    if (!config) {
      throw new NotFoundException(`Aucune config Git trouvée pour le projet ${projectId}`);
    }

    return this.forType(config.provider?.type ?? GitProviderType.GITLAB);
  }

  /**
   * Résout le provider par type explicite.
   */
  forType(type: GitProviderType): IGitProvider {
    switch (type) {
      case GitProviderType.GITHUB:
        return this.github;
      case GitProviderType.GITLAB:
      default:
        return this.gitlab as unknown as IGitProvider;
    }
  }

  // ─── Méthodes directes (raccourci sans forProject) ────────────────────────

  async listRepos(projectId: string, userId: string, userRole: Role): Promise<RepoItem[]> {
    const provider = await this.forProject(projectId);
    return provider.listRepos(projectId, userId, userRole);
  }

  async listBranches(projectId: string, userId: string, userRole: Role): Promise<BranchItem[]> {
    const provider = await this.forProject(projectId);
    return provider.listBranches(projectId, userId, userRole);
  }

  async listPipelines(projectId: string, userId: string, userRole: Role): Promise<PipelineItem[]> {
    const provider = await this.forProject(projectId);
    return provider.listPipelines(projectId, userId, userRole);
  }

  async triggerPipeline(
    projectId: string,
    branch: string,
    userId: string,
    userRole: Role,
    preferredRepoId?: number,
  ): Promise<PipelineItem> {
    const provider = await this.forProject(projectId);
    return provider.triggerPipeline(projectId, branch, userId, userRole, preferredRepoId);
  }

  async handleWebhook(payload: unknown, providerType?: GitProviderType): Promise<WebhookResult> {
    const provider = this.forType(providerType ?? GitProviderType.GITLAB);
    return provider.handleWebhook(payload);
  }

  async verifyWebhookToken(
    token: string | undefined,
    payload?: Record<string, unknown>,
    providerType?: GitProviderType,
  ): Promise<void> {
    const provider = this.forType(providerType ?? GitProviderType.GITLAB);
    return provider.verifyWebhookToken(token, payload);
  }
}
