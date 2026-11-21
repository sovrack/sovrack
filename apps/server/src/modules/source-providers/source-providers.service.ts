import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { GitProviderType } from '@prisma/client';
import { Role } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { activeWhere } from '../../shared/database/prisma-active.helper';
import { GitlabAdapter } from './adapters/gitlab/gitlab.adapter';
import { GitlabClient } from './adapters/gitlab/gitlab.client';
import { GitlabConnectionService } from './adapters/gitlab/gitlab-connection.service';
import { GithubAdapter } from './adapters/github/github.adapter';
import { ConnectSourceDto } from './dto/connect-source.dto';
import type {
  IGitProvider,
  RepoItem,
  BranchItem,
  PipelineItem,
} from './contracts/git-provider.contract';

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
export class SourceProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gitlabCore: GitlabAdapter,
    private readonly gitlabApi: GitlabClient,
    private readonly gitlabConnection: GitlabConnectionService,
    private readonly github: GithubAdapter,
  ) {}

  /**
   * REGISTRE des providers — la SEULE source de vérité de la liste.
   * Ajouter un fournisseur (Bitbucket, Gitea, self-hosted…) = implémenter
   * IGitProvider + l'injecter + l'ajouter à CETTE liste. Aucune autre
   * méthode (forType/listAvailable) ne change → principe Open/Closed.
   */
  private get registeredProviders(): IGitProvider[] {
    return [this.gitlabCore, this.github];
  }

  /**
   * List all registered provider instances. Useful for the admin UI
   * ("intégrations" tab) and for tests that want to verify which
   * providers are wired without hardcoding the enum.
   */
  listAvailable(): IGitProvider[] {
    return this.registeredProviders;
  }

  /**
   * Résout le provider approprié pour un service donné.
   */
  async forService(serviceId: string): Promise<IGitProvider> {
    const svc = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { providerId: true, project: { select: { teamId: true } } },
    });
    if (!svc?.providerId) {
      throw new NotFoundException(
        `Aucune config Git trouvée pour le service ${serviceId}`,
      );
    }
    const config = await this.prisma.gitProviderConfig.findFirst({
      where: { id: svc.providerId, teamId: svc.project.teamId },
      select: { type: true },
    });
    if (!config) {
      throw new NotFoundException(
        `Aucune config Git trouvée pour le service ${serviceId}`,
      );
    }
    return this.forType(config.type ?? GitProviderType.GITLAB);
  }

  /**
   * Résout le provider via le PREMIER service du projet qui a un providerId.
   *
   * ⚠️ INVARIANT : le provider est lié au SERVICE, pas au projet. Un projet
   * peut mélanger des providers (GitLab + GitHub). Cette méthode n'est donc
   * correcte que pour un projet MONO-provider. Tout nouveau code doit partir
   * d'un serviceId et utiliser `forService()`. Voir docs/ARCHITECTURE.md §1bis.
   */
  async forProject(projectId: string): Promise<IGitProvider> {
    const svc = await this.prisma.service.findFirst({
      where: activeWhere({ projectId, providerId: { not: null } }),
      select: {
        providerId: true,
        project: { select: { teamId: true } },
      },
    });
    if (!svc?.providerId) {
      throw new NotFoundException(
        `Aucune config Git trouvée pour le projet ${projectId}`,
      );
    }
    const config = await this.prisma.gitProviderConfig.findFirst({
      where: { id: svc.providerId, teamId: svc.project.teamId },
      select: { type: true },
    });
    if (!config) {
      throw new NotFoundException(
        `Aucune config Git trouvée pour le projet ${projectId}`,
      );
    }
    return this.forType(config.type ?? GitProviderType.GITLAB);
  }

  /**
   * Résout le provider par type via le REGISTRE (plus de switch en dur).
   * Un type non enregistré → 400 explicite. Ajouter un provider ne touche
   * jamais cette méthode.
   */
  forType(type: GitProviderType): IGitProvider {
    const provider = this.registeredProviders.find((p) => p.type === type);
    if (!provider) {
      throw new BadRequestException(`Fournisseur Git non supporté : ${type}`);
    }
    return provider;
  }

  async assertProviderForProject(
    providerId: string,
    projectId: string,
    expectedType?: GitProviderType,
  ): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { teamId: true },
    });
    if (!project) {
      throw new NotFoundException(`Projet ${projectId} introuvable`);
    }
    const config = await this.prisma.gitProviderConfig.findFirst({
      where: {
        id: providerId,
        teamId: project.teamId,
        ...(expectedType ? { type: expectedType } : {}),
      },
      select: { id: true },
    });
    if (!config) {
      throw new NotFoundException(
        'Configuration Git introuvable dans ce workspace',
      );
    }
  }

  // ─── Méthodes directes (raccourci sans forProject) ────────────────────────

  async listRepos(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<RepoItem[]> {
    const provider = await this.forProject(projectId);
    return provider.listRepos(projectId, userId, userRole);
  }

  async listBranches(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<BranchItem[]> {
    const provider = await this.forProject(projectId);
    return provider.listBranches(projectId, userId, userRole);
  }

  async listPipelines(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<PipelineItem[]> {
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
    return provider.triggerPipeline(
      projectId,
      branch,
      userId,
      userRole,
      preferredRepoId,
    );
  }

  async resolveProviderType(projectId: string): Promise<GitProviderType> {
    const svc = await this.prisma.service.findFirst({
      where: { projectId, providerId: { not: null } },
      select: { providerId: true },
    });
    if (!svc?.providerId) return GitProviderType.GITLAB;
    const config = await this.prisma.gitProviderConfig.findUnique({
      where: { id: svc.providerId },
      select: { type: true },
    });
    return config?.type ?? GitProviderType.GITLAB;
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
  async listSourceProviders(teamId: string): Promise<SourceProviderOption[]> {
    const providers = await this.prisma.gitProviderConfig.findMany({
      where: { teamId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return providers.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      url: p.providerUrl,
      isDefault: p.isDefault,
      status:
        Boolean(p.oauthAccessToken) || Boolean(p.adminToken)
          ? 'CONFIGURED'
          : 'ACTION_REQUIRED',
    }));
  }

  async connectRepo(
    projectId: string,
    repoPath: string,
    provider: GitProviderType,
    token: string,
    userId: string,
    userRole: Role,
    branch?: string,
    providerId?: string,
  ): Promise<void> {
    switch (provider) {
      case GitProviderType.GITLAB:
        await this.gitlabCore.connectProject(
          projectId,
          {
            gitlabToken: token,
            repoPath,
            defaultBranch: branch ?? 'main',
            providerId,
          },
          userId,
          userRole,
        );
        break;
      case GitProviderType.GITHUB:
        await this.github.connectProject(projectId, {
          gitlabToken: token,
          repoPath,
          defaultBranch: branch ?? 'main',
          providerId,
        });
        break;
    }
  }

  async discoverGroup(
    projectId: string,
    groupPath: string,
    provider: GitProviderType,
    token: string | undefined,
    providerId?: string,
  ): Promise<{ repoPath: string; name: string; defaultBranch: string }[]> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { teamId: true },
    });
    if (!project) {
      throw new NotFoundException(`Projet ${projectId} introuvable`);
    }
    switch (provider) {
      case GitProviderType.GITLAB: {
        const connection =
          await this.gitlabConnection.resolveGitlabConnectionInput(
            {
              gitlabToken: token,
              providerId,
            },
            project.teamId,
          );
        const baseUrl = this.gitlabConnection.normalizeUrl(
          connection.gitlabUrl,
        );
        const repos = await this.gitlabApi.listGroupRepositoriesByConnection(
          baseUrl,
          groupPath,
          connection.gitlabToken,
        );
        return repos.map((repo) => {
          const r = repo as Record<string, unknown>;
          const str = (v: unknown): string | undefined =>
            typeof v === 'string'
              ? v
              : typeof v === 'number'
                ? String(v)
                : undefined;
          const id = str(r.id) ?? '';
          const path = str(r.path);
          return {
            repoPath: str(r.path_with_namespace) ?? path ?? id,
            name: str(r.name) ?? path ?? id,
            defaultBranch: str(r.default_branch) ?? 'main',
          };
        });
      }
      case GitProviderType.GITHUB:
        return this.github.discoverOrgRepos(
          groupPath,
          token,
          providerId,
          project.teamId,
        );
      default:
        throw new BadRequestException(`Provider non supporté: ${provider}`);
    }
  }

  async connectSource(
    projectId: string,
    dto: ConnectSourceDto,
    userId: string,
    userRole: Role,
  ): Promise<unknown> {
    switch (dto.provider) {
      case GitProviderType.GITLAB: {
        return this.gitlabCore.connectProject(
          projectId,
          {
            gitlabToken: dto.token,
            providerId: dto.providerId,
            repoPath: dto.repoPath,
            groupPath: dto.groupPath,
            defaultBranch: dto.defaultBranch ?? 'main',
          },
          userId,
          userRole,
        );
      }
      case GitProviderType.GITHUB: {
        return this.github.connectProject(projectId, {
          gitlabToken: dto.token ?? '',
          repoPath: dto.repoPath ?? '',
          defaultBranch: dto.defaultBranch ?? 'main',
          providerId: dto.providerId,
        });
      }
      default:
        throw new BadRequestException(`Provider non supporté: ${dto.provider}`);
    }
  }
}
