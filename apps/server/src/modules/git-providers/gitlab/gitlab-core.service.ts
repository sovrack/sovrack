import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppSourceType,
  ProjectRole,
  Role,
  type AppProviderLink,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../core/database/prisma.service';
import { ConnectGitlabDto } from './dto/connect-gitlab.dto';
import {
  GitlabApiService,
  GitlabBranchItem,
  GitlabGroupRepositoriesPage,
  GitlabGroupRepositoriesQuery,
  GitlabPipelineItem,
  GitlabRepoItem,
} from './gitlab-api.service';
import {
  GitlabCryptoService,
  PublicGitlabConfig,
} from './gitlab-crypto.service';
import {
  GitlabWebhookPayload,
  GitlabWebhookService,
} from './gitlab-webhook.service';
import {
  GitProviderConfigService,
  type GitlabProviderProjectOption,
} from '../config/git-provider-config.service';

type RegistryCredentials = {
  registryUrl: string;
  username: string;
  password: string;
};

@Injectable()
export class GitlabCoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiService: GitlabApiService,
    private readonly webhookService: GitlabWebhookService,
    private readonly cryptoService: GitlabCryptoService,
    private readonly gitProviderRegistry: GitProviderConfigService,
  ) {}

  async connectProject(
    projectId: string,
    dto: ConnectGitlabDto,
    userId: string,
    userRole: Role,
  ): Promise<PublicGitlabConfig> {
    await this.assertCanManageProject(projectId, userId, userRole);

    const connection = await this.resolveGitlabConnectionInput(dto);
    const baseUrl = this.normalizeUrl(connection.gitlabUrl);
    const defaultBranch = dto.defaultBranch ?? 'main';
    const sourceType = dto.sourceType ?? AppSourceType.REPO;
    const webhookSecret = randomBytes(32).toString('hex');
    const deployTokenUsername = dto.deployTokenUsername?.trim() || null;
    const deployTokenValue = dto.deployTokenValue?.trim() || null;
    const registryUrl = dto.registryUrl?.trim() || null;
    let gitlabId: number | null = null;
    let gitlabGroupId: number | null = null;
    // Provider-agnostic clone identity (Dokploy model): the repository PATH.
    let repoPathNamespace: string | null = null;

    if (sourceType === AppSourceType.REPO) {
      const repoIdentifier = this.normalizeGitlabIdentifier(
        dto.gitlabId,
        'gitlabId',
      );
      const repository = await this.apiService.getProjectByConnection(
        baseUrl,
        repoIdentifier,
        connection.gitlabToken,
      );
      gitlabId = this.resolveNumericGitlabId(
        repository.id,
        repoIdentifier,
        'repository',
      );
      repoPathNamespace = repository.path_with_namespace ?? null;
    } else {
      const groupIdentifier = this.normalizeGitlabIdentifier(
        dto.gitlabGroupId,
        'gitlabGroupId',
      );
      const group = await this.apiService.getGroupByConnection(
        baseUrl,
        groupIdentifier,
        connection.gitlabToken,
      );
      gitlabGroupId = this.resolveNumericGitlabId(
        group.id,
        groupIdentifier,
        'group',
      );
    }

    const config = await this.prisma.appProviderLink.upsert({
      where: { projectId },
      update: {
        providerUrl: baseUrl,
        providerToken: this.cryptoService.encrypt(connection.gitlabToken),
        externalId: gitlabId,
        repoPathNamespace,
        defaultBranch,
        sourceType,
        externalGroupId: gitlabGroupId,
        providerId: connection.providerId,
        deployTokenUsername,
        deployTokenValue: deployTokenValue
          ? this.cryptoService.encrypt(deployTokenValue)
          : null,
        webhookSecret: this.cryptoService.encrypt(webhookSecret),
        registryUrl,
      },
      create: {
        projectId,
        providerUrl: baseUrl,
        providerToken: this.cryptoService.encrypt(connection.gitlabToken),
        externalId: gitlabId,
        repoPathNamespace,
        defaultBranch,
        sourceType,
        externalGroupId: gitlabGroupId,
        providerId: connection.providerId,
        deployTokenUsername,
        deployTokenValue: deployTokenValue
          ? this.cryptoService.encrypt(deployTokenValue)
          : null,
        webhookSecret: this.cryptoService.encrypt(webhookSecret),
        registryUrl,
      },
    });

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        repoUrl: baseUrl,
        externalRepoId: gitlabId,
        branch: defaultBranch,
      },
    });

    // Auto-create a default service for REPO connections so deployments work immediately
    if (sourceType === AppSourceType.REPO && gitlabId) {
      const existing = await this.prisma.projectService.findFirst({
        where: { projectId, externalRepoId: gitlabId },
      });
      if (!existing) {
        const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
        await this.prisma.projectService.create({
          data: {
            projectId,
            name: project?.name ?? 'app',
            type: 'OTHER',
            externalRepoId: gitlabId,
            repositoryPath: repoPathNamespace,
            defaultBranch,
            dockerfilePath: 'Dockerfile',
          },
        });
      }

      // Create a GitProviderRepo link so the webhook can find the project by repo ID
      // (used by GitLabWebhookService to identify which project a webhook belongs to).
      if (connection.providerId) {
        const repoFullName = await this.apiService
          .getProjectByConnection(baseUrl, String(gitlabId), connection.gitlabToken)
          .then((repo) => repo.path_with_namespace ?? '')
          .catch(() => '');
        if (repoFullName) {
          await this.prisma.gitProviderRepo.upsert({
            where: {
              providerId_repoFullName: {
                providerId: connection.providerId,
                repoFullName,
              },
            },
            create: {
              providerId: connection.providerId,
              projectId,
              externalRepoIdBig: BigInt(gitlabId),
              repoFullName,
              defaultBranch,
              webhookSecret: this.cryptoService.encrypt(webhookSecret),
            },
            update: {
              projectId,
              externalRepoIdBig: BigInt(gitlabId),
              defaultBranch,
              webhookSecret: this.cryptoService.encrypt(webhookSecret),
            },
          });
        }
      }
    }

    // Auto-sync repos from GitLab group as ProjectServices so the Build tab works immediately
    if (sourceType === AppSourceType.GROUP && gitlabGroupId) {
      try {
        const repos = await this.apiService.fetchGroupRepositories(
          config,
          (url) => this.normalizeUrl(url),
        );
        for (const repo of repos) {
          if (!repo.id) continue;
          const repoId = Number(repo.id);
          const repoName = repo.name ?? repo.path ?? String(repoId);
          const repoBranch = repo.default_branch ?? repo.defaultBranch ?? 'main';
          const existing = await this.prisma.projectService.findFirst({
            where: { projectId, externalRepoId: repoId },
          });
          if (!existing) {
            await this.prisma.projectService.create({
              data: {
                projectId,
                name: repoName,
                type: 'OTHER',
                externalRepoId: repoId,
                defaultBranch: repoBranch,
                dockerfilePath: 'Dockerfile',
                repositoryPath: repo.path_with_namespace ?? repo.pathWithNamespace ?? repo.path,
              },
            });
          }
        }
      } catch {
        // Non-blocking: group repo sync failure should not prevent the connection from saving
      }
    }

    return this.cryptoService.toPublicConfig(config);
  }

  async verifyConnectionInput(dto: ConnectGitlabDto): Promise<void> {
    const connection = await this.resolveGitlabConnectionInput(dto);
    const baseUrl = this.normalizeUrl(connection.gitlabUrl);
    const sourceType = dto.sourceType ?? AppSourceType.REPO;
    const defaultBranch = dto.defaultBranch?.trim() || 'main';

    if (sourceType === AppSourceType.REPO) {
      const repoIdentifier = this.normalizeGitlabIdentifier(
        dto.gitlabId,
        'gitlabId',
      );

      await this.apiService.getProjectByConnection(
        baseUrl,
        repoIdentifier,
        connection.gitlabToken,
      );

      const branches = await this.apiService.listProjectBranchesByConnection(
        baseUrl,
        repoIdentifier,
        connection.gitlabToken,
      );
      const branchExists = branches.some((branch) => {
        const name = branch.name;
        return typeof name === 'string' && name === defaultBranch;
      });

      if (!branchExists) {
        throw new BadRequestException(
          `Branche "${defaultBranch}" introuvable sur le repository GitLab.`,
        );
      }
      return;
    }

    const gitlabGroupId = this.normalizeGitlabIdentifier(
      dto.gitlabGroupId,
      'gitlabGroupId',
    );

    await this.apiService.getGroupByConnection(
      baseUrl,
      gitlabGroupId,
      connection.gitlabToken,
    );

    const repositories =
      await this.apiService.listGroupRepositoriesByConnection(
        baseUrl,
        gitlabGroupId,
        connection.gitlabToken,
      );

    if (repositories.length === 0) {
      throw new BadRequestException(
        'Aucun repository trouvé dans ce groupe GitLab.',
      );
    }
  }

  async getBranches(
    projectId: string,
    userId: string,
    userRole: Role,
    preferredRepoId?: number,
  ): Promise<GitlabBranchItem[]> {
    await this.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.getProjectConfig(projectId);
    const repoId = await this.resolveRepoIdForAction(
      config,
      'récupération des branches',
      preferredRepoId,
    );

    return await this.apiService.getBranches(config, repoId, (url) =>
      this.normalizeUrl(url),
    );
  }

  async getRepos(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabRepoItem[]> {
    await this.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.getProjectConfig(projectId);

    if (config.sourceType === AppSourceType.GROUP) {
      return await this.apiService.fetchGroupRepositories(config, (url) =>
        this.normalizeUrl(url),
      );
    }

    const repoId = this.assertRepoSource(config, 'récupération du repository');
    return await this.apiService.getRepos(config, repoId, (url) =>
      this.normalizeUrl(url),
    );
  }

  async listAvailableProviders(): Promise<GitlabProviderProjectOption[]> {
    return await this.gitProviderRegistry.listGitlabProvidersForProjects();
  }

  async listGroupRepositoriesByProvider(params: {
    providerId?: string;
    gitlabUrl?: string;
    gitlabToken?: string;
    groupId: string;
    query?: GitlabGroupRepositoriesQuery;
  }): Promise<GitlabGroupRepositoriesPage> {
    const connection = await this.resolveGitlabConnectionInput({
      providerId: params.providerId,
      gitlabUrl: params.gitlabUrl,
      gitlabToken: params.gitlabToken,
    } as ConnectGitlabDto);

    const page = await this.apiService.listGroupRepositoriesPageByConnection(
      this.normalizeUrl(connection.gitlabUrl),
      this.normalizeGitlabIdentifier(params.groupId, 'groupId'),
      connection.gitlabToken,
      params.query,
    );

    return {
      ...page,
      items: page.items.map((repo) => ({
        ...repo,
        pathWithNamespace: repo.path_with_namespace,
        defaultBranch: repo.default_branch,
        webUrl: repo.web_url,
        lastActivityAt: repo.last_activity_at,
      })),
    };
  }

  async listProjectBranchesByProvider(params: {
    providerId?: string;
    gitlabUrl?: string;
    gitlabToken?: string;
    projectId: string;
  }): Promise<GitlabBranchItem[]> {
    const connection = await this.resolveGitlabConnectionInput({
      providerId: params.providerId,
      gitlabUrl: params.gitlabUrl,
      gitlabToken: params.gitlabToken,
    } as ConnectGitlabDto);

    return await this.apiService.listProjectBranchesByConnection(
      this.normalizeUrl(connection.gitlabUrl),
      this.normalizeGitlabIdentifier(params.projectId, 'projectId'),
      connection.gitlabToken,
    );
  }

  async handleWebhook(
    payload: GitlabWebhookPayload,
  ): Promise<{ status: 'ignored' | 'ok' }> {
    return await this.webhookService.handleWebhook(payload);
  }

  async getGitlabConfig(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<PublicGitlabConfig> {
    await this.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.getProjectConfig(projectId);
    return this.cryptoService.toPublicConfig(config);
  }

  async verifyWebhookToken(
    token?: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await this.webhookService.verifyWebhookToken(token, payload);
  }

  resolveRegistryCredentials(config: AppProviderLink): RegistryCredentials {
    // Déchiffrer les tokens
    const deployTokenValue = config.deployTokenValue
      ? this.cryptoService.decryptConfigToken(config.deployTokenValue)
      : '';
    const gitlabToken = this.cryptoService.decryptConfigToken(
      config.providerToken,
    );

    // Valider que deployToken a un format valide (commence par gldt- ou gr-)
    const isValidDeployToken =
      deployTokenValue &&
      deployTokenValue.length > 10 &&
      (deployTokenValue.startsWith('gldt-') ||
        deployTokenValue.startsWith('gr-'));

    // Récupérer le registryUrl
    const registryUrl =
      config.registryUrl?.trim() || this.extractRegistryUrl(config.providerUrl);

    // Logique: Si deployToken fourni, exiger deployTokenUsername
    if (isValidDeployToken && config.deployTokenUsername?.trim()) {
      return {
        registryUrl,
        username: config.deployTokenUsername.trim(),
        password: deployTokenValue,
      };
    }

    // Si deployTokenValue fourni mais pas décryptable ou pas deployTokenUsername
    // → Fallback à gitlabToken + oauth2
    if (config.deployTokenValue) {
      return {
        registryUrl,
        username: 'oauth2',
        password: gitlabToken,
      };
    }

    // Aucun deployToken → utiliser gitlabToken + oauth2
    return {
      registryUrl,
      username: 'oauth2',
      password: gitlabToken,
    };
  }

  async resolveRepositoryPath(
    config: AppProviderLink,
    fallbackProjectSlug: string,
    preferredRepoId?: number,
  ): Promise<string> {
    return await this.apiService.resolveRepositoryPath({
      config,
      fallbackProjectSlug,
      preferredRepoId,
      normalizeRepositoryPath: (value) => this.normalizeRepositoryPath(value),
      normalizeUrl: (value) => this.normalizeUrl(value),
      resolveRepoIdForAction: async (candidateConfig, action, selectedRepoId) =>
        await this.resolveRepoIdForAction(
          candidateConfig,
          action,
          selectedRepoId,
        ),
    });
  }

  async getProjectConfig(projectId: string): Promise<AppProviderLink> {
    const config = await this.prisma.appProviderLink.findUnique({
      where: { projectId },
    });

    if (!config) {
      throw new NotFoundException(
        'Configuration GitLab non trouvée pour ce projet',
      );
    }

    return config;
  }

  private async resolveGitlabConnectionInput(dto: ConnectGitlabDto): Promise<{
    gitlabUrl: string;
    gitlabToken: string;
    providerId: string | null;
  }> {
    const manualUrl = this.normalizeOptionalString(dto.gitlabUrl);
    const manualToken = this.normalizeOptionalString(dto.gitlabToken);

    if (dto.providerId) {
      // If the user supplied a PAT directly, use it without requiring the
      // provider to have a stored OAuth/admin token. This allows connecting
      // when the provider has no configured token yet.
      if (manualToken) {
        const providers =
          await this.gitProviderRegistry.listGitlabProvidersForProjects();
        const provider = providers.find((p) => p.id === dto.providerId);
        const providerUrl = provider?.gitlabUrl ?? 'https://gitlab.com';
        return {
          gitlabUrl: manualUrl ?? providerUrl,
          gitlabToken: manualToken,
          providerId: dto.providerId,
        };
      }

      // No manual token — require the provider to have OAuth or admin token.
      const providerCredentials =
        await this.gitProviderRegistry.resolveGitlabCredentials(
          dto.providerId,
        );

      return {
        gitlabUrl: manualUrl ?? providerCredentials.gitlabUrl,
        gitlabToken: providerCredentials.token,
        providerId: providerCredentials.providerId,
      };
    }

    if (manualUrl && manualToken) {
      return {
        gitlabUrl: manualUrl,
        gitlabToken: manualToken,
        providerId: null,
      };
    }

    if (manualUrl || manualToken) {
      throw new BadRequestException(
        'Fournissez gitlabUrl + gitlabToken ensemble, ou utilisez providerId',
      );
    }

    const defaultProviderCredentials =
      await this.gitProviderRegistry.resolveGitlabCredentials();

    return {
      gitlabUrl: defaultProviderCredentials.gitlabUrl,
      gitlabToken: defaultProviderCredentials.token,
      providerId: defaultProviderCredentials.providerId,
    };
  }

  normalizeUrl(url: string): string {
    return url.trim().replace(/\/+$/, '');
  }

  private normalizeOptionalString(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeGitlabIdentifier(
    value: number | string | undefined | null,
    label: string,
  ): string {
    if (typeof value === 'number') {
      if (Number.isInteger(value) && value > 0) {
        return String(value);
      }
      throw new BadRequestException(`${label} GitLab invalide`);
    }

    if (typeof value === 'string') {
      const normalized = value.trim().replace(/^\/+|\/+$/g, '');
      if (normalized.length > 0) {
        return normalized;
      }
    }

    throw new BadRequestException(`${label} GitLab est requis`);
  }

  private resolveNumericGitlabId(
    apiId: number | undefined,
    identifier: string,
    label: string,
  ): number {
    if (Number.isInteger(apiId) && apiId !== undefined && apiId > 0) {
      return apiId;
    }

    const parsed = Number(identifier);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }

    throw new BadRequestException(
      `GitLab ${label}: impossible de résoudre un ID numérique depuis "${identifier}"`,
    );
  }

  private normalizeRepositoryPath(value: string): string {
    return value
      .trim()
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .replace(/\.git$/i, '');
  }

  private extractRegistryUrl(gitlabUrl: string): string {
    try {
      const parsed = new URL(gitlabUrl);
      return parsed.host;
    } catch {
      return gitlabUrl;
    }
  }

  assertRepoSource(config: AppProviderLink, action: string): number {
    if (config.sourceType !== AppSourceType.REPO || !config.externalId) {
      throw new BadRequestException(
        `Action indisponible pour une source GROUP (${action})`,
      );
    }

    return Number(config.externalId);
  }

  async resolveRepoIdForAction(
    config: AppProviderLink,
    action: string,
    preferredRepoId?: number,
  ): Promise<number> {
    if (config.sourceType === AppSourceType.REPO) {
      return this.assertRepoSource(config, action);
    }

    const repos = await this.apiService.fetchGroupRepositories(config, (url) =>
      this.normalizeUrl(url),
    );
    const repoIds = repos
      .map((repo) => repo.id)
      .filter(
        (id): id is number =>
          typeof id === 'number' && Number.isInteger(id) && id > 0,
      );

    if (repoIds.length === 0) {
      throw new BadRequestException(
        `Aucun repository disponible dans le groupe (${action})`,
      );
    }

    if (
      Number.isInteger(preferredRepoId) &&
      preferredRepoId !== undefined &&
      preferredRepoId > 0
    ) {
      if (repoIds.includes(preferredRepoId)) {
        return preferredRepoId;
      }

      throw new BadRequestException(
        `Repository ${String(preferredRepoId)} introuvable dans ce groupe (${action})`,
      );
    }

    if (config.externalId && repoIds.includes(Number(config.externalId))) {
      return Number(config.externalId);
    }

    return repoIds[0];
  }

  async assertCanAccessProject(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.ensureProjectExists(projectId);

    if (userRole === Role.ADMIN) {
      return;
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Accès non autorisé à ce projet');
    }
  }

  private async assertCanManageProject(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.ensureProjectExists(projectId);

    if (userRole === Role.ADMIN) {
      return;
    }

    const ownerMembership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    if (!ownerMembership || ownerMembership.role !== ProjectRole.OWNER) {
      throw new ForbiddenException(
        'Action réservée au OWNER du projet ou ADMIN',
      );
    }
  }

  private async ensureProjectExists(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }
  }
}
