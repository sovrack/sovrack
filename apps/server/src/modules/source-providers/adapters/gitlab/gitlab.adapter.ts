import { Injectable } from '@nestjs/common';
import { SourceType, Role } from '@prisma/client';
import type { GitlabResolvedConfig } from './gitlab.types';
import { ConnectGitlabDto } from './dto/connect-gitlab.dto';
import {
  GitlabClient,
  GitlabBranchItem,
  GitlabGroupRepositoriesPage,
  GitlabGroupRepositoriesQuery,
  GitlabPipelineItem,
  GitlabRepoItem,
} from './gitlab.client';
import { PublicGitlabConfig } from './gitlab.types';
import {
  GitProviderConfigService,
  type GitlabProviderProjectOption,
} from '../../shared/connection/git-provider-config.service';
import { GitlabAuthorizationService } from './gitlab-authorization.service';
import { GitlabCiService } from './gitlab-ci.service';
import { GitlabProjectConfigService } from './gitlab-project-config.service';
import { GitlabConnectionService } from './gitlab-connection.service';
import { GitlabCredentialService } from './gitlab-credential.service';
import { GitlabFileService } from './gitlab-file.service';
import { GitlabWebhookConfiguratorService } from './gitlab-webhook-configurator.service';
import { GitlabOnboardingService } from './gitlab-onboarding.service';
import { GitlabImageRefService } from './gitlab-image-ref.service';
import type {
  IGitProvider,
  RepoItem,
  BranchItem,
  PipelineItem,
  RegistryCredentials,
  GitCredentials,
  RepoWriteResult,
  WebhookConfigResult,
} from '../../contracts/git-provider.contract';

@Injectable()
export class GitlabAdapter implements IGitProvider {
  readonly type = 'GITLAB' as const;

  constructor(
    private readonly apiService: GitlabClient,
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
    // Extraits de GitlabAdapter — voir EXPLORATION_BACKEND_DEPENDANCES.md
    // section 4 (connectProject/verifyConnectionInput + résolution
    // config/image Docker).
    private readonly onboarding: GitlabOnboardingService,
    private readonly imageRefService: GitlabImageRefService,
  ) {}

  async connectProject(
    projectId: string,
    dto: ConnectGitlabDto,
    userId: string,
    userRole: Role,
  ): Promise<PublicGitlabConfig> {
    return this.onboarding.connectProject(projectId, dto, userId, userRole);
  }

  async verifyConnectionInput(dto: ConnectGitlabDto): Promise<void> {
    return this.onboarding.verifyConnectionInput(dto);
  }

  async getBranches(
    projectId: string,
    userId: string,
    userRole: Role,
    preferredRepoId?: number,
    serviceId?: string,
  ): Promise<GitlabBranchItem[]> {
    await this.auth.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.projectConfig.getProjectConfig(
      projectId,
      serviceId,
    );
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

    const repoId = this.projectConfig.assertRepoSource(
      config,
      'récupération du repository',
    );
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

  resolveRegistryCredentialsFromConfig(
    config: GitlabResolvedConfig,
  ): RegistryCredentials {
    return this.credential.resolveRegistryCredentialsFromConfig(config);
  }

  async resolveRepositoryPathFromConfig(
    config: GitlabResolvedConfig,
    fallbackProjectSlug: string,
    preferredRepoId?: number,
  ): Promise<string> {
    return this.imageRefService.resolveRepositoryPathFromConfig(
      config,
      fallbackProjectSlug,
      preferredRepoId,
    );
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
    return {
      id: raw.id,
      status: raw.status,
      ref: raw.ref,
      sha: raw.sha,
      webUrl: raw.web_url,
    };
  }

  async listRepos(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<RepoItem[]> {
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

  async listBranches(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<BranchItem[]> {
    const raw = await this.getBranches(projectId, userId, userRole);
    return raw.map((b) => {
      const branch = b as Record<string, unknown>;
      const name = branch['name'];
      const commitId = (
        branch['commit'] as Record<string, unknown> | undefined
      )?.['id'];
      return {
        name: typeof name === 'string' ? name : '',
        isDefault: Boolean(branch['default'] ?? false),
        commitSha: typeof commitId === 'string' ? commitId : '',
      };
    });
  }

  async listPipelines(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<PipelineItem[]> {
    const raw = await this.ci.getPipelines(projectId, userId, userRole);
    return raw.map((p) => ({
      id: p.id,
      status: p.status,
      ref: p.ref,
      sha: p.sha,
      webUrl: p.web_url,
    }));
  }

  async resolveRegistryCredentials(
    projectId: string,
  ): Promise<RegistryCredentials> {
    const { config } = await this.imageRefService.loadResolvedConfig(
      projectId,
    );
    return this.resolveRegistryCredentialsFromConfig(config);
  }

  async resolveRepositoryPath(
    projectId: string,
    preferredRepoId?: number | string,
  ): Promise<string> {
    const { config } = await this.imageRefService.loadResolvedConfig(
      projectId,
    );
    return this.resolveRepositoryPathFromConfig(
      config,
      config.defaultBranch ?? '',
      typeof preferredRepoId === 'string'
        ? Number(preferredRepoId)
        : preferredRepoId,
    );
  }

  async readFile(
    projectId: string,
    filePath: string,
    ref?: string,
    serviceId?: string,
  ): Promise<string | null> {
    return this.fileService.readFile(projectId, filePath, ref, serviceId);
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
    return this.webhookConfigurator.configureWebhook(
      projectId,
      webhookUrl,
      secret,
      serviceId,
    );
  }

  async resolveGitCredentials(
    projectId: string,
    serviceId?: string,
  ): Promise<GitCredentials> {
    return this.fileService.resolveGitCredentials(projectId, serviceId);
  }

  async resolveDockerImageRef(
    projectId: string,
    branch: string,
    serviceId?: string,
  ): Promise<string> {
    return this.imageRefService.resolveDockerImageRef(
      projectId,
      branch,
      serviceId,
    );
  }
}
