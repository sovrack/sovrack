import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import {
  GitlabSourceType,
  PipelineStatus,
  ProjectMemberRole,
  Role,
  type GitlabConfig,
} from '@prisma/client';
import * as CryptoJS from 'crypto-js';
import { randomBytes } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { DeploymentsService } from '../deployments/deployments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectGitlabDto } from './dto/connect-gitlab.dto';

type GitlabPipelineItem = {
  id: number;
  status: string;
  ref: string;
  sha: string;
  web_url: string;
};

type GitlabWebhookPayload = {
  object_kind?: string;
  event_name?: string;
  project_id?: number;
  project?: { id?: number };
  object_attributes?: {
    id?: number;
    status?: string;
    ref?: string;
    sha?: string;
    url?: string;
    web_url?: string;
  };
};

type GitlabBranchItem = Record<string, unknown>;
type PublicGitlabConfig = Omit<
  GitlabConfig,
  'gitlabToken' | 'deployTokenValue' | 'webhookSecret'
> & {
  gitlabToken: string;
  deployTokenValue: string;
  webhookSecret: string | null;
};

type RegistryCredentials = {
  registryUrl: string;
  username: string;
  password: string;
};

type GitlabProjectSummary = {
  path_with_namespace?: string;
  path?: string;
  namespace?: {
    full_path?: string;
  };
};

type GitlabGroupSummary = {
  full_path?: string;
  path?: string;
};

type GitlabRepoItem = Record<string, unknown>;

@Injectable()
export class GitlabService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    @Optional()
    @Inject(forwardRef(() => DeploymentsService))
    private readonly deploymentsService?: DeploymentsService,
  ) {}

  // Connecte un projet local a un projet GitLab externe.
  async connectProject(
    projectId: string,
    dto: ConnectGitlabDto,
    userId: string,
    userRole: Role,
  ): Promise<PublicGitlabConfig> {
    await this.assertCanManageProject(projectId, userId, userRole);

    const baseUrl = this.normalizeUrl(dto.gitlabUrl);
    const defaultBranch = dto.defaultBranch ?? 'main';
    const sourceType = dto.sourceType ?? GitlabSourceType.REPO;
    const webhookSecret = randomBytes(32).toString('hex');
    const deployTokenUsername = dto.deployTokenUsername?.trim() || null;
    const deployTokenValue = dto.deployTokenValue?.trim() || null;
    const registryUrl = dto.registryUrl?.trim() || null;
    const gitlabId = sourceType === GitlabSourceType.REPO ? dto.gitlabId : null;
    const gitlabGroupId =
      sourceType === GitlabSourceType.GROUP ? dto.gitlabGroupId : null;

    if (sourceType === GitlabSourceType.REPO) {
      if (!gitlabId || gitlabId <= 0) {
        throw new BadRequestException(
          'gitlabId est requis pour une source REPO',
        );
      }
      await this.validateGitlabRepoConnection(
        baseUrl,
        gitlabId,
        dto.gitlabToken,
      );
    } else {
      if (!gitlabGroupId || gitlabGroupId <= 0) {
        throw new BadRequestException(
          'gitlabGroupId est requis pour une source GROUP',
        );
      }
      await this.validateGitlabGroupConnection(
        baseUrl,
        gitlabGroupId,
        dto.gitlabToken,
      );
    }

    const config = await this.prisma.gitlabConfig.upsert({
      where: { projectId },
      update: {
        gitlabUrl: baseUrl,
        gitlabToken: this.encrypt(dto.gitlabToken),
        gitlabId,
        defaultBranch,
        sourceType,
        gitlabGroupId,
        deployTokenUsername,
        deployTokenValue: deployTokenValue
          ? this.encrypt(deployTokenValue)
          : null,
        webhookSecret: this.encrypt(webhookSecret),
        registryUrl,
      },
      create: {
        projectId,
        gitlabUrl: baseUrl,
        gitlabToken: this.encrypt(dto.gitlabToken),
        gitlabId,
        defaultBranch,
        sourceType,
        gitlabGroupId,
        deployTokenUsername,
        deployTokenValue: deployTokenValue
          ? this.encrypt(deployTokenValue)
          : null,
        webhookSecret: this.encrypt(webhookSecret),
        registryUrl,
      },
    });

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        gitlabUrl: baseUrl,
        gitlabId,
        branch: defaultBranch,
      },
    });

    return this.toPublicConfig(config, webhookSecret);
  }

  // Retourne les branches GitLab pour un projet autorise.
  async getBranches(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabBranchItem[]> {
    await this.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.getProjectConfig(projectId);
    const repoId = this.assertRepoSource(config, 'récupération des branches');
    const gitlabToken = this.decryptConfigToken(config.gitlabToken);

    try {
      const response = await firstValueFrom(
        this.httpService.get<GitlabBranchItem[]>(
          `${this.normalizeUrl(config.gitlabUrl)}/api/v4/projects/${encodeURIComponent(String(repoId))}/repository/branches`,
          {
            headers: {
              'PRIVATE-TOKEN': gitlabToken,
            },
          },
        ),
      );

      return response.data;
    } catch (error: unknown) {
      this.throwGitlabRequestError('récupération des branches', error);
    }
  }

  // Recupere les pipelines GitLab, puis synchronise en base locale.
  async getPipelines(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabPipelineItem[]> {
    await this.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.getProjectConfig(projectId);
    const repoId = this.assertRepoSource(config, 'récupération des pipelines');
    const gitlabToken = this.decryptConfigToken(config.gitlabToken);

    try {
      const response = await firstValueFrom(
        this.httpService.get<GitlabPipelineItem[]>(
          `${this.normalizeUrl(config.gitlabUrl)}/api/v4/projects/${encodeURIComponent(String(repoId))}/pipelines`,
          {
            headers: {
              'PRIVATE-TOKEN': gitlabToken,
            },
          },
        ),
      );

      for (const pipeline of response.data) {
        await this.upsertPipeline(projectId, pipeline);
      }

      return response.data;
    } catch (error: unknown) {
      this.throwGitlabRequestError('récupération des pipelines', error);
    }
  }

  // Declenche un pipeline sur une branche cible.
  async triggerPipeline(
    projectId: string,
    branch: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabPipelineItem> {
    await this.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.getProjectConfig(projectId);
    const repoId = this.assertRepoSource(config, 'déclenchement du pipeline');
    const gitlabToken = this.decryptConfigToken(config.gitlabToken);

    try {
      const response = await firstValueFrom(
        this.httpService.post<GitlabPipelineItem>(
          `${this.normalizeUrl(config.gitlabUrl)}/api/v4/projects/${encodeURIComponent(String(repoId))}/pipeline`,
          { ref: branch },
          {
            headers: {
              'PRIVATE-TOKEN': gitlabToken,
            },
          },
        ),
      );

      await this.upsertPipeline(projectId, response.data);
      return response.data;
    } catch (error: unknown) {
      this.throwGitlabRequestError(
        `déclenchement du pipeline (${branch})`,
        error,
      );
    }
  }

  // Retourne les repositories disponibles selon le type de source (REPO/GROUP).
  async getRepos(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabRepoItem[]> {
    await this.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.getProjectConfig(projectId);
    const gitlabToken = this.decryptConfigToken(config.gitlabToken);

    if (config.sourceType === GitlabSourceType.GROUP) {
      if (!config.gitlabGroupId) {
        throw new BadRequestException('Aucun gitlabGroupId configuré');
      }

      try {
        const response = await firstValueFrom(
          this.httpService.get<GitlabRepoItem[]>(
            `${this.normalizeUrl(config.gitlabUrl)}/api/v4/groups/${encodeURIComponent(String(config.gitlabGroupId))}/projects`,
            {
              headers: {
                'PRIVATE-TOKEN': gitlabToken,
              },
            },
          ),
        );
        return response.data;
      } catch (error: unknown) {
        this.throwGitlabRequestError(
          'récupération des repositories du groupe',
          error,
        );
      }
    }

    const repoId = this.assertRepoSource(config, 'récupération du repository');
    try {
      const response = await firstValueFrom(
        this.httpService.get<GitlabRepoItem>(
          `${this.normalizeUrl(config.gitlabUrl)}/api/v4/projects/${encodeURIComponent(String(repoId))}`,
          {
            headers: {
              'PRIVATE-TOKEN': gitlabToken,
            },
          },
        ),
      );
      return [response.data];
    } catch (error: unknown) {
      this.throwGitlabRequestError('récupération du repository', error);
    }
  }

  // Traite le webhook GitLab et met a jour les statuts de pipeline.
  async handleWebhook(
    payload: GitlabWebhookPayload,
  ): Promise<{ status: 'ignored' | 'ok' }> {
    const isPipelineEvent =
      payload.object_kind === 'pipeline' || payload.event_name === 'pipeline';

    if (!isPipelineEvent) {
      return { status: 'ignored' };
    }

    const gitlabProjectId = payload.project_id ?? payload.project?.id;
    const pipelineId = payload.object_attributes?.id;

    if (!gitlabProjectId || !pipelineId) {
      return { status: 'ignored' };
    }

    const config = await this.prisma.gitlabConfig.findFirst({
      where: {
        sourceType: GitlabSourceType.REPO,
        gitlabId: gitlabProjectId,
      },
    });

    if (!config) {
      return { status: 'ignored' };
    }

    const status = this.mapPipelineStatus(payload.object_attributes?.status);
    const ref = payload.object_attributes?.ref ?? config.defaultBranch;
    const sha = payload.object_attributes?.sha ?? '';
    const webUrl =
      payload.object_attributes?.web_url ??
      payload.object_attributes?.url ??
      '';

    await this.prisma.pipeline.upsert({
      where: {
        projectId_gitlabId: {
          projectId: config.projectId,
          gitlabId: pipelineId,
        },
      },
      update: {
        status,
        ref,
        sha,
        webUrl,
      },
      create: {
        projectId: config.projectId,
        gitlabId: pipelineId,
        status,
        ref,
        sha,
        webUrl,
      },
    });

    if (this.deploymentsService) {
      await this.deploymentsService.handleWebhookUpdate(
        pipelineId,
        payload.object_attributes?.status ?? 'pending',
      );
    }

    return { status: 'ok' };
  }

  // Retourne la config GitLab en masquant le token.
  async getGitlabConfig(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<PublicGitlabConfig> {
    await this.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.getProjectConfig(projectId);
    return this.toPublicConfig(config);
  }

  async verifyWebhookToken(
    token?: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    if (!token) {
      throw new ForbiddenException('Token webhook GitLab manquant');
    }

    const projectId = this.extractWebhookProjectId(payload);
    const groupId = this.extractWebhookGroupId(payload);
    const lookupIds = Array.from(
      new Set([projectId, groupId].filter((id): id is number => id !== null)),
    );

    if (lookupIds.length > 0) {
      const config = await this.prisma.gitlabConfig.findFirst({
        where: {
          OR: lookupIds.flatMap((id) => [
            { gitlabId: id },
            {
              sourceType: GitlabSourceType.GROUP,
              gitlabGroupId: id,
            },
          ]),
        },
      });

      if (config?.webhookSecret) {
        const expectedSecret = this.decryptConfigToken(config.webhookSecret);
        if (token === expectedSecret) {
          return;
        }
        throw new ForbiddenException('Token webhook GitLab invalide');
      }
    }

    // Compatibilité legacy: fallback vers variable globale si secret projet absent.
    if (process.env.GITLAB_TOKEN && token === process.env.GITLAB_TOKEN) {
      return;
    }

    throw new ForbiddenException('Token webhook GitLab invalide');
  }

  // Retourne les credentials registry (deploy token prioritaire sinon PAT GitLab).
  resolveRegistryCredentials(config: GitlabConfig): RegistryCredentials {
    const deployToken = config.deployTokenValue
      ? this.decryptConfigToken(config.deployTokenValue)
      : '';
    const gitlabToken = this.decryptConfigToken(config.gitlabToken);
    const password = deployToken || gitlabToken;
    const username = config.deployTokenUsername?.trim() || 'oauth2';
    const registryUrl =
      config.registryUrl?.trim() || this.extractRegistryUrl(config.gitlabUrl);

    return {
      registryUrl,
      username,
      password,
    };
  }

  // Résout un chemin de repository utilisable pour construire une image Docker.
  async resolveRepositoryPath(
    config: GitlabConfig,
    fallbackProjectSlug: string,
  ): Promise<string> {
    const normalizedFallback = this.normalizeRepositoryPath(fallbackProjectSlug);

    if (config.sourceType === GitlabSourceType.REPO && config.gitlabId) {
      const gitlabToken = this.decryptConfigToken(config.gitlabToken);

      try {
        const response = await firstValueFrom(
          this.httpService.get<GitlabProjectSummary>(
            `${this.normalizeUrl(config.gitlabUrl)}/api/v4/projects/${encodeURIComponent(String(config.gitlabId))}`,
            {
              headers: {
                'PRIVATE-TOKEN': gitlabToken,
              },
            },
          ),
        );

        const fullPath = response.data.path_with_namespace;
        if (typeof fullPath === 'string' && fullPath.trim()) {
          return this.normalizeRepositoryPath(fullPath);
        }

        const namespacePath = response.data.namespace?.full_path;
        const repoPath = response.data.path;
        if (
          typeof namespacePath === 'string' &&
          namespacePath.trim() &&
          typeof repoPath === 'string' &&
          repoPath.trim()
        ) {
          return this.normalizeRepositoryPath(`${namespacePath}/${repoPath}`);
        }
      } catch {
        // Fallback silencieux: on conserve un chemin stable.
      }

      return `project-${String(config.gitlabId)}/${normalizedFallback}`;
    }

    if (config.sourceType === GitlabSourceType.GROUP && config.gitlabGroupId) {
      const gitlabToken = this.decryptConfigToken(config.gitlabToken);

      try {
        const response = await firstValueFrom(
          this.httpService.get<GitlabGroupSummary>(
            `${this.normalizeUrl(config.gitlabUrl)}/api/v4/groups/${encodeURIComponent(String(config.gitlabGroupId))}`,
            {
              headers: {
                'PRIVATE-TOKEN': gitlabToken,
              },
            },
          ),
        );

        const groupPath =
          typeof response.data.full_path === 'string' &&
          response.data.full_path.trim()
            ? response.data.full_path
            : response.data.path;

        if (typeof groupPath === 'string' && groupPath.trim()) {
          return this.normalizeRepositoryPath(
            `${groupPath}/${normalizedFallback}`,
          );
        }
      } catch {
        // Fallback silencieux: on conserve un chemin stable.
      }

      return `group-${String(config.gitlabGroupId)}/${normalizedFallback}`;
    }

    return normalizedFallback;
  }

  private async upsertPipeline(
    projectId: string,
    pipeline: GitlabPipelineItem,
  ) {
    await this.prisma.pipeline.upsert({
      where: {
        projectId_gitlabId: {
          projectId,
          gitlabId: pipeline.id,
        },
      },
      update: {
        status: this.mapPipelineStatus(pipeline.status),
        ref: pipeline.ref,
        sha: pipeline.sha ?? '',
        webUrl: pipeline.web_url ?? '',
      },
      create: {
        projectId,
        gitlabId: pipeline.id,
        status: this.mapPipelineStatus(pipeline.status),
        ref: pipeline.ref,
        sha: pipeline.sha ?? '',
        webUrl: pipeline.web_url ?? '',
      },
    });
  }

  private async getProjectConfig(projectId: string): Promise<GitlabConfig> {
    const config = await this.prisma.gitlabConfig.findUnique({
      where: { projectId },
    });

    if (!config) {
      throw new NotFoundException(
        'Configuration GitLab non trouvée pour ce projet',
      );
    }

    return config;
  }

  private normalizeUrl(url: string): string {
    return url.trim().replace(/\/+$/, '');
  }

  private throwGitlabRequestError(action: string, error: unknown): never {
    const err = error as {
      message?: string;
      response?: { status?: number; data?: unknown };
    };

    const status = err.response?.status;
    const data = err.response?.data;

    let details = '';
    if (typeof data === 'string') {
      details = data;
    } else if (data && typeof data === 'object') {
      const payload = data as { message?: unknown; error?: unknown };
      if (typeof payload.message === 'string') {
        details = payload.message;
      } else if (Array.isArray(payload.message)) {
        details = payload.message
          .filter((item): item is string => typeof item === 'string')
          .join(', ');
      } else if (typeof payload.error === 'string') {
        details = payload.error;
      }
    }

    const parts = [
      status ? `HTTP ${String(status)}` : null,
      details || err.message || null,
    ].filter((value): value is string => Boolean(value));

    throw new BadRequestException(
      parts.length > 0
        ? `GitLab: ${action} échoué (${parts.join(' - ')})`
        : `GitLab: ${action} échoué`,
    );
  }

  private mapPipelineStatus(status?: string): PipelineStatus {
    switch ((status ?? '').toLowerCase()) {
      case 'pending':
        return PipelineStatus.PENDING;
      case 'running':
        return PipelineStatus.RUNNING;
      case 'success':
        return PipelineStatus.SUCCESS;
      case 'failed':
        return PipelineStatus.FAILED;
      case 'canceled':
      case 'cancelled':
        return PipelineStatus.CANCELED;
      default:
        return PipelineStatus.PENDING;
    }
  }

  private toPublicConfig(
    config: GitlabConfig,
    webhookSecretOverride?: string,
  ): PublicGitlabConfig {
    const webhookSecret = webhookSecretOverride
      ? webhookSecretOverride
      : config.webhookSecret
        ? this.decryptConfigToken(config.webhookSecret)
        : null;

    return {
      ...config,
      gitlabToken: '***',
      deployTokenValue: config.deployTokenValue ? '***' : '',
      webhookSecret,
    };
  }

  // Chiffre un secret en AES avec CONFIG_SECRET.
  private encrypt(value: string): string {
    const secret = process.env.CONFIG_SECRET;
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'CONFIG_SECRET doit contenir au moins 32 caractères',
      );
    }

    return CryptoJS.AES.encrypt(value, secret).toString();
  }

  // Déchiffre un token GitLab; fallback en clair pour compatibilité historique.
  private decryptConfigToken(value: string): string {
    const secret = process.env.CONFIG_SECRET;
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'CONFIG_SECRET doit contenir au moins 32 caractères',
      );
    }

    const decrypted = CryptoJS.AES.decrypt(value, secret).toString(
      CryptoJS.enc.Utf8,
    );

    if (decrypted) {
      return decrypted;
    }

    return value;
  }

  private extractWebhookProjectId(
    payload?: Record<string, unknown>,
  ): number | null {
    if (!payload) {
      return null;
    }

    const projectId = payload.project_id;
    if (typeof projectId === 'number') {
      return projectId;
    }

    if (payload.project && typeof payload.project === 'object') {
      const project = payload.project as Record<string, unknown>;
      if (typeof project.id === 'number') {
        return project.id;
      }
    }

    return null;
  }

  private extractWebhookGroupId(
    payload?: Record<string, unknown>,
  ): number | null {
    if (!payload) {
      return null;
    }

    const groupId = payload.group_id;
    if (typeof groupId === 'number') {
      return groupId;
    }

    if (payload.project && typeof payload.project === 'object') {
      const project = payload.project as Record<string, unknown>;

      if (typeof project.namespace_id === 'number') {
        return project.namespace_id;
      }

      if (project.namespace && typeof project.namespace === 'object') {
        const namespace = project.namespace as Record<string, unknown>;
        if (typeof namespace.id === 'number') {
          return namespace.id;
        }
      }
    }

    return null;
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

  private async validateGitlabRepoConnection(
    baseUrl: string,
    gitlabId: number,
    gitlabToken: string,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.get(
          `${baseUrl}/api/v4/projects/${encodeURIComponent(String(gitlabId))}`,
          {
            headers: {
              'PRIVATE-TOKEN': gitlabToken,
            },
          },
        ),
      );
    } catch {
      throw new BadRequestException('Connexion GitLab échouée');
    }
  }

  private async validateGitlabGroupConnection(
    baseUrl: string,
    gitlabGroupId: number,
    gitlabToken: string,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.get(
          `${baseUrl}/api/v4/groups/${encodeURIComponent(String(gitlabGroupId))}`,
          {
            headers: {
              'PRIVATE-TOKEN': gitlabToken,
            },
          },
        ),
      );
    } catch {
      throw new BadRequestException('Connexion GitLab groupe échouée');
    }
  }

  private assertRepoSource(config: GitlabConfig, action: string): number {
    if (config.sourceType !== GitlabSourceType.REPO || !config.gitlabId) {
      throw new BadRequestException(
        `Action indisponible pour une source GROUP (${action})`,
      );
    }

    return config.gitlabId;
  }

  private async assertCanAccessProject(
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

    if (!ownerMembership || ownerMembership.role !== ProjectMemberRole.OWNER) {
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
