import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  GitProviderType,
  SourceType,
  Role,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../../core/database/prisma.service';
import { sanitizeDockerTag } from '../../../../core/utils/docker-tag.util';
import { ConnectGitlabDto } from './dto/connect-gitlab.dto';
import {
  GitlabApiService,
  GitlabBranchItem,
  GitlabGroupRepositoriesPage,
  GitlabGroupRepositoriesQuery,
  GitlabPipelineItem,
  GitlabRepoItem,
} from './gitlab-api.service';
import { CryptoService } from '../../../../core/crypto/crypto.service';
import { PublicGitlabConfig } from './gitlab.types';
import {
  GitProviderConfigService,
  type GitlabProviderProjectOption,
} from '../../config/git-provider-config.service';
import { GitlabAuthorizationService } from './gitlab-authorization.service';
import { GitlabCiService } from './gitlab-ci.service';
import { GitlabProjectConfigService } from './gitlab-project-config.service';
import { GitlabConnectionService } from './gitlab-connection.service';
import { GitlabCredentialService } from './gitlab-credential.service';
import { GitlabFileService } from './gitlab-file.service';
import { GitlabWebhookConfiguratorService } from './gitlab-webhook-configurator.service';
import type {
  IGitProvider,
  RepoItem,
  BranchItem,
  PipelineItem,
  RegistryCredentials,
  GitCredentials,
  RepoWriteResult,
  WebhookConfigResult,
} from '../../interfaces/source-provider.interface';

@Injectable()
export class GitlabCoreService implements IGitProvider {
  readonly type = 'GITLAB' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiService: GitlabApiService,
    private readonly cryptoService: CryptoService,
    private readonly gitProviderRegistry: GitProviderConfigService,
    // Plus de forwardRef : le cycle core↔ci est cassé (ci ne dépend plus de
    // core, voir GitlabProjectConfigService). Injection directe.
    private readonly ci: GitlabCiService,
    private readonly fileService: GitlabFileService,
    private readonly webhookConfigurator: GitlabWebhookConfiguratorService,
    private readonly auth: GitlabAuthorizationService,
    private readonly connection: GitlabConnectionService,
    private readonly credential: GitlabCredentialService,
    private readonly projectConfig: GitlabProjectConfigService,
  ) {}

  async connectProject(
    projectId: string,
    dto: ConnectGitlabDto,
    userId: string,
    userRole: Role,
  ): Promise<PublicGitlabConfig> {
    await this.auth.assertCanManageProject(projectId, userId, userRole);

    const connection = await this.connection.resolveGitlabConnectionInput(dto);
    const baseUrl = this.connection.normalizeUrl(connection.gitlabUrl);
    const defaultBranch = dto.defaultBranch ?? 'main';
    const webhookSecret = randomBytes(32).toString('hex');

    let repoPath: string | null = null;
    let groupPath: string | null = null;

    if (dto.repoPath) {
      const repository = await this.apiService.getProjectByConnection(
        baseUrl,
        dto.repoPath,
        connection.gitlabToken,
      );
      repoPath = repository.path_with_namespace ?? dto.repoPath;
    } else if (dto.groupPath) {
      await this.apiService.getGroupByConnection(
        baseUrl,
        dto.groupPath,
        connection.gitlabToken,
      );
      groupPath = dto.groupPath;
    }

    // Find or create GitProviderConfig
    let gitProviderConfigId = connection.providerId;
    if (!gitProviderConfigId) {
      const newConfig = await this.prisma.gitProviderConfig.create({
        data: {
          name: `gitlab-${projectId.slice(0, 8)}`,
          type: GitProviderType.GITLAB,
          providerUrl: baseUrl,
          adminToken: this.cryptoService.encrypt(connection.gitlabToken),
          isDefault: false,
        },
      });
      gitProviderConfigId = newConfig.id;
    }

    // Find or create environment and service
    let env = await this.prisma.environment.findFirst({ where: { projectId } });
    if (!env) {
      env = await this.prisma.environment.create({
        data: { name: 'production', projectId },
      });
    }

    const config = {
      id: gitProviderConfigId,
      gitlabUrl: baseUrl,
      adminToken: connection.gitlabToken,
      repoPath,
      groupPath,
      defaultBranch,
      sourceType: SourceType.GIT,
      providerId: gitProviderConfigId,
      webhookSecret,
      createdAt: new Date(),
      updatedAt: new Date(),
      projectId,
    } as any;

    // For single repo: create Service + GitProviderRepo
    if (repoPath) {
      const existingSvc = await this.prisma.service.findFirst({
        where: { projectId, providerId: gitProviderConfigId },
      });

      const svc = await this.prisma.service.upsert({
        where: { id: existingSvc?.id ?? '00000000-0000-0000-0000-000000000000' },
        create: {
          projectId,
          name: repoPath.split('/').pop() ?? `project-${projectId.slice(0, 8)}`,
          type: 'APPLICATION' as any,
          sourceType: SourceType.GIT,
          repoPath: repoPath,
          branch: defaultBranch,
          providerId: gitProviderConfigId,
        },
        update: {
          branch: defaultBranch,
          providerId: gitProviderConfigId,
        },
      });

      const existingLink = await this.prisma.serviceEnvironment.findFirst({
        where: { serviceId: svc.id, environmentId: env.id },
      });
      if (!existingLink) {
        await this.prisma.serviceEnvironment.create({
          data: { serviceId: svc.id, environmentId: env.id },
        });
      }

      if (connection.providerId) {
        await this.prisma.gitProviderRepo.upsert({
          where: {
            providerId_repoPath: {
              providerId: connection.providerId,
              repoPath,
            },
          },
          create: {
            providerId: connection.providerId,
            projectId,
            repoPath,
            defaultBranch,
            webhookSecret: this.cryptoService.encrypt(webhookSecret),
          },
          update: {
            projectId,
            defaultBranch,
            webhookSecret: this.cryptoService.encrypt(webhookSecret),
          },
        });
      }
    }

    // For group: auto-sync repos as GitProviderRepo entries
    if (groupPath) {
      try {
        const repos = await this.apiService.fetchGroupRepositories(
          config,
          (url) => this.connection.normalizeUrl(url),
        );
        for (const repo of repos) {
          if (!repo.path_with_namespace) continue;
          const repoBranch = repo.default_branch ?? repo.defaultBranch ?? 'main';
          await this.prisma.gitProviderRepo.upsert({
            where: {
              providerId_repoPath: {
                providerId: gitProviderConfigId,
                repoPath: repo.path_with_namespace,
              },
            },
            create: {
              providerId: gitProviderConfigId,
              repoPath: repo.path_with_namespace,
              defaultBranch: repoBranch,
            },
            update: {
              defaultBranch: repoBranch,
            },
          });
        }
      } catch {
        // Non-blocking
      }
    }

    return this.connection.toPublicConfig(config);
  }

  async verifyConnectionInput(dto: ConnectGitlabDto): Promise<void> {
    const connection = await this.connection.resolveGitlabConnectionInput(dto);
    const baseUrl = this.connection.normalizeUrl(connection.gitlabUrl);
    const defaultBranch = dto.defaultBranch?.trim() || 'main';

    if (dto.repoPath) {
      await this.apiService.getProjectByConnection(
        baseUrl,
        dto.repoPath,
        connection.gitlabToken,
      );

      const branches = await this.apiService.listProjectBranchesByConnection(
        baseUrl,
        dto.repoPath,
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

    if (dto.groupPath) {
      await this.apiService.getGroupByConnection(
        baseUrl,
        dto.groupPath,
        connection.gitlabToken,
      );

      const repositories =
        await this.apiService.listGroupRepositoriesByConnection(
          baseUrl,
          dto.groupPath,
          connection.gitlabToken,
        );

      if (repositories.length === 0) {
        throw new BadRequestException(
          'Aucun repository trouvé dans ce groupe GitLab.',
        );
      }
    }
  }

  async getBranches(
    projectId: string,
    userId: string,
    userRole: Role,
    preferredRepoId?: number,
  ): Promise<GitlabBranchItem[]> {
    await this.auth.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.projectConfig.getProjectConfig(projectId);
    const repoId = await this.projectConfig.resolveRepoIdForAction(
      config,
      'récupération des branches',
      preferredRepoId,
    );

    return await this.apiService.getBranches(config, repoId, (url) =>
      this.connection.normalizeUrl(url),
    );
  }

  async getRepos(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabRepoItem[]> {
    await this.auth.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.projectConfig.getProjectConfig(projectId);

    if (config.sourceType === SourceType.GIT) {
      return await this.apiService.fetchGroupRepositories(config, (url) =>
        this.connection.normalizeUrl(url),
      );
    }

    const repoId = this.projectConfig.assertRepoSource(config, 'récupération du repository');
    return await this.apiService.getRepos(config, repoId, (url) =>
      this.connection.normalizeUrl(url),
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
    const connection = await this.connection.resolveGitlabConnectionInput({
      providerId: params.providerId,
      gitlabUrl: params.gitlabUrl,
      gitlabToken: params.gitlabToken,
    } as ConnectGitlabDto);

    const page = await this.apiService.listGroupRepositoriesPageByConnection(
      this.connection.normalizeUrl(connection.gitlabUrl),
      params.groupId,
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
    const connection = await this.connection.resolveGitlabConnectionInput({
      providerId: params.providerId,
      gitlabUrl: params.gitlabUrl,
      gitlabToken: params.gitlabToken,
    } as ConnectGitlabDto);

    return await this.apiService.listProjectBranchesByConnection(
      this.connection.normalizeUrl(connection.gitlabUrl),
      params.projectId,
      connection.gitlabToken,
    );
  }

  async getGitlabConfig(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<PublicGitlabConfig> {
    await this.auth.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.projectConfig.getProjectConfig(projectId);
    return this.connection.toPublicConfig(config);
  }

  resolveRegistryCredentialsFromConfig(config: any): RegistryCredentials {
    return this.credential.resolveRegistryCredentialsFromConfig(config);
  }

  async resolveRepositoryPathFromConfig(
    config: any,
    fallbackProjectSlug: string,
    preferredRepoId?: number,
  ): Promise<string> {
    return await this.apiService.resolveRepositoryPath({
      config,
      fallbackProjectSlug,
      preferredRepoId,
      normalizeRepositoryPath: (value) => this.connection.normalizeRepositoryPath(value),
      normalizeUrl: (value) => this.connection.normalizeUrl(value),
      resolveRepoIdForAction: async (candidateConfig, action, selectedRepoId) =>
        await this.projectConfig.resolveRepoIdForAction(
          candidateConfig,
          action,
          selectedRepoId,
        ),
    });
  }

  // ─── IGitProvider interface methods ───────────────────────────────────────

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

  async resolveRegistryCredentials(projectId: string): Promise<RegistryCredentials> {
    const svc = await this.prisma.service.findFirst({
      where: { projectId, providerId: { not: null } },
    });
    if (!svc?.providerId) {
      throw new NotFoundException(
        `Aucune config GitLab pour le projet ${projectId}`,
      );
    }
    const gitProviderConfig = await this.prisma.gitProviderConfig.findUnique({
      where: { id: svc.providerId },
    });
    if (!gitProviderConfig) {
      throw new NotFoundException(
        `Aucune config GitLab pour le projet ${projectId}`,
      );
    }
    const config: any = {
      ...gitProviderConfig,
      projectId,
      providerUrl: gitProviderConfig.providerUrl,
      providerToken: gitProviderConfig.adminToken || gitProviderConfig.oauthAccessToken || '',
      sourceType: svc.sourceType,
      defaultBranch: svc.branch,
      externalId: null,
      repoPathNamespace: null,
      externalGroupId: null,
      deployTokenUsername: null,
      deployTokenValue: null,
      webhookSecret: null,
      registryUrl: null,
      providerId: gitProviderConfig.id,
    };
    return this.resolveRegistryCredentialsFromConfig(config);
  }

  async resolveRepositoryPath(
    projectId: string,
    preferredRepoId?: number | string,
  ): Promise<string> {
    const svc = await this.prisma.service.findFirst({
      where: { projectId, providerId: { not: null } },
    });
    if (!svc?.providerId) {
      throw new NotFoundException(
        `Aucune config GitLab pour le projet ${projectId}`,
      );
    }
    const gitProviderConfig = await this.prisma.gitProviderConfig.findUnique({
      where: { id: svc.providerId },
    });
    if (!gitProviderConfig) {
      throw new NotFoundException(
        `Aucune config GitLab pour le projet ${projectId}`,
      );
    }
    const config: any = {
      ...gitProviderConfig,
      projectId,
      providerUrl: gitProviderConfig.providerUrl,
      providerToken: gitProviderConfig.adminToken || gitProviderConfig.oauthAccessToken || '',
      sourceType: svc.sourceType,
      defaultBranch: svc.branch,
      externalId: null,
      repoPathNamespace: null,
      externalGroupId: null,
      deployTokenUsername: null,
      deployTokenValue: null,
      webhookSecret: null,
      registryUrl: null,
      providerId: gitProviderConfig.id,
    };
    return this.resolveRepositoryPathFromConfig(
      config,
      config.defaultBranch,
      typeof preferredRepoId === 'string'
        ? Number(preferredRepoId)
        : preferredRepoId,
    );
  }

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

  async configureWebhook(
    projectId: string,
    webhookUrl: string,
    secret: string,
    serviceId?: string,
  ): Promise<WebhookConfigResult> {
    return this.webhookConfigurator.configureWebhook(projectId, webhookUrl, secret, serviceId);
  }

  async resolveGitCredentials(projectId: string, serviceId?: string): Promise<GitCredentials> {
    return this.fileService.resolveGitCredentials(projectId, serviceId);
  }

  async resolveDockerImageRef(
    projectId: string,
    branch: string,
    serviceId?: string,
  ): Promise<string> {
    const svc = await this.prisma.service.findFirst({
      where: { projectId, providerId: { not: null } },
    });
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });
     const slug = sanitizeDockerTag(project?.name ?? projectId);

     const tag = sanitizeDockerTag(branch);

    if (!svc?.providerId) {
      return `${slug}:${tag}`;
    }
    const gitProviderConfig = await this.prisma.gitProviderConfig.findUnique({ where: { id: svc.providerId } });
    if (!gitProviderConfig) return `${slug}:${tag}`;

    const config: any = {
      ...gitProviderConfig,
      projectId,
      providerUrl: gitProviderConfig.providerUrl,
      providerToken: gitProviderConfig.adminToken || gitProviderConfig.oauthAccessToken || '',
      sourceType: svc.sourceType,
      defaultBranch: svc.branch,
      externalId: null,
      repoPathNamespace: null,
      externalGroupId: null,
      deployTokenUsername: null,
      deployTokenValue: null,
      webhookSecret: null,
      registryUrl: null,
      providerId: gitProviderConfig.id,
    };

    let preferredRepoId: number | undefined;
    let projectSlug = slug;
    if (serviceId) {
      const svcDetail = await this.prisma.service.findUnique({
        where: { id: serviceId },
        select: { name: true },
      });
      if (svcDetail?.name) projectSlug = `${slug}-${sanitizeDockerTag(svcDetail.name)}`;
    }

    const registryHost = this.credential.resolveRegistryHost(gitProviderConfig.providerUrl, gitProviderConfig.providerUrl);
    const repoPath = await this.resolveRepositoryPathFromConfig(config, projectSlug, preferredRepoId);
    const finalPath =
      this.credential.isPlaceholderPath(config, repoPath) && svc?.repoPath
        ? (this.credential.extractPathFromUrl(svc.repoPath) ?? repoPath)
        : repoPath;

    return `${registryHost}/${finalPath}:${tag}`;
  }

}
