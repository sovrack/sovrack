import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { GitProviderType, AppSourceType } from '@prisma/client';
import { Role } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { GitlabService } from './gitlab/gitlab.service';
import { GithubService } from './github/github.service';
import { ConnectSourceDto } from './gitlab/dto/connect-gitlab.dto';
import type {
  IGitProvider,
  RepoItem,
  BranchItem,
  PipelineItem,
  WebhookResult,
} from './interfaces/git-provider.interface';

/**
 * Type-guard helper. Forces TypeScript to refuse compilation when a new
 * `GitProviderType` value is added without updating the switch in
 * `forType`. Same idea as the `PlaybookRouter.assertNever`.
 */
function assertNever(value: never): never {
  throw new Error(`Unhandled GitProviderType: ${String(value)}`);
}

/** Provider-agnostic source option for the unified "Connect source" UI. */
export type SourceProviderOption = {
  id: string;
  name: string;
  type: GitProviderType;
  url: string;
  isDefault: boolean;
  status: 'CONFIGURED' | 'ACTION_REQUIRED' | 'NOT_CONFIGURED';
};

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
   * List all registered provider instances. Useful for the admin UI
   * ("intégrations" tab) and for tests that want to verify which
   * providers are wired without hardcoding the enum.
   */
  listAvailable(): IGitProvider[] {
    return [this.gitlab as unknown as IGitProvider, this.github];
  }

  /**
   * Résout le provider approprié pour un projet donné.
   */
  async forProject(projectId: string): Promise<IGitProvider> {
    const config = await this.prisma.appProviderLink.findUnique({
      where: { projectId },
      include: { provider: { select: { type: true } } },
    });

    if (!config) {
      throw new NotFoundException(`Aucune config Git trouvée pour le projet ${projectId}`);
    }

    return this.forType(config.provider?.type ?? GitProviderType.GITLAB);
  }

  /**
   * Résout le provider par type explicite. Uses `assertNever` so adding a
   * new `GitProviderType` value to the enum forces a code change here at
   * compile time.
   */
  forType(type: GitProviderType): IGitProvider {
    switch (type) {
      case GitProviderType.GITHUB:
        return this.github;
      case GitProviderType.GITLAB:
        return this.gitlab as unknown as IGitProvider;
      default:
        return assertNever(type);
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

  async resolveProviderType(projectId: string): Promise<GitProviderType> {
    const config = await this.prisma.appProviderLink.findUnique({
      where: { projectId },
      include: { provider: { select: { type: true } } },
    });
    return config?.provider?.type ?? GitProviderType.GITLAB;
  }

  /**
   * Connecte une source (GitLab ou GitHub) à un projet.
   * Délègue au provider spécifié par `dto.provider`.
   */
  /**
   * Lists ALL configured source providers (GitHub + GitLab) with their type,
   * for the unified provider picker. Status is provider-agnostic: a provider
   * is usable when it has an OAuth or admin token.
   */
  async listSourceProviders(): Promise<SourceProviderOption[]> {
    const providers = await this.prisma.gitProviderConfig.findMany({
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return providers.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      url: p.gitlabUrl,
      isDefault: p.isDefault,
      status: (Boolean(p.oauthAccessToken) || Boolean(p.adminToken)
        ? 'CONFIGURED'
        : 'ACTION_REQUIRED') as SourceProviderOption['status'],
    }));
  }

  async connectSource(
    projectId: string,
    dto: ConnectSourceDto,
    userId: string,
    userRole: Role,
  ): Promise<unknown> {
    switch (dto.provider) {
      case GitProviderType.GITLAB: {
        const glDto = this.toConnectGitlabDto(dto);
        return this.gitlab.connectProject(projectId, glDto, userId, userRole);
      }
      case GitProviderType.GITHUB: {
        return this.github.connectProject(projectId, {
          gitlabToken: dto.githubToken ?? '',
          repoPath: dto.repoPath ?? dto.repoFullName ?? '',
          defaultBranch: dto.defaultBranch ?? 'main',
          providerId: dto.providerId,
          sourceType: dto.sourceType ?? AppSourceType.REPO,
          registryUrl: dto.registryUrl,
        });
      }
      default:
        throw new BadRequestException(`Provider non supporté: ${dto.provider}`);
    }
  }

  private toConnectGitlabDto(dto: ConnectSourceDto): import('./gitlab/dto/connect-gitlab.dto').ConnectGitlabDto {
    return {
      gitlabUrl: dto.gitlabUrl ?? 'https://gitlab.com',
      gitlabToken: dto.gitlabToken ?? '',
      providerId: dto.providerId,
      gitlabId: dto.gitlabId ?? dto.repoPath,
      defaultBranch: dto.defaultBranch ?? 'main',
      sourceType: dto.sourceType,
      gitlabGroupId: dto.gitlabGroupId,
      deployTokenUsername: dto.deployTokenUsername,
      deployTokenValue: dto.deployTokenValue,
      registryUrl: dto.registryUrl,
    };
  }
}
