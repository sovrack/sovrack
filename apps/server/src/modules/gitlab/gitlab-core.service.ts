import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GitlabSourceType,
  ProjectRole,
  Role,
  type GitlabConfig,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectGitlabDto } from './dto/connect-gitlab.dto';
import {
  GitlabApiService,
  GitlabBranchItem,
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
  ) {}

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
      await this.apiService.validateGitlabRepoConnection(
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
      await this.apiService.validateGitlabGroupConnection(
        baseUrl,
        gitlabGroupId,
        dto.gitlabToken,
      );
    }

    const config = await this.prisma.gitlabConfig.upsert({
      where: { projectId },
      update: {
        gitlabUrl: baseUrl,
        gitlabToken: this.cryptoService.encrypt(dto.gitlabToken),
        gitlabId,
        defaultBranch,
        sourceType,
        gitlabGroupId,
        deployTokenUsername,
        deployTokenValue: deployTokenValue
          ? this.cryptoService.encrypt(deployTokenValue)
          : null,
        webhookSecret: this.cryptoService.encrypt(webhookSecret),
        registryUrl,
      },
      create: {
        projectId,
        gitlabUrl: baseUrl,
        gitlabToken: this.cryptoService.encrypt(dto.gitlabToken),
        gitlabId,
        defaultBranch,
        sourceType,
        gitlabGroupId,
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
        gitlabUrl: baseUrl,
        gitlabId,
        branch: defaultBranch,
      },
    });

    return this.cryptoService.toPublicConfig(config, webhookSecret);
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

  async getPipelines(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabPipelineItem[]> {
    await this.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.getProjectConfig(projectId);
    const repoId = this.assertRepoSource(config, 'récupération des pipelines');

    const pipelines = await this.apiService.getPipelines(config, repoId, (url) =>
      this.normalizeUrl(url),
    );

    for (const pipeline of pipelines) {
      await this.webhookService.upsertPipeline(projectId, pipeline);
    }

    return pipelines;
  }

  async triggerPipeline(
    projectId: string,
    branch: string,
    userId: string,
    userRole: Role,
    preferredRepoId?: number,
  ): Promise<GitlabPipelineItem> {
    await this.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.getProjectConfig(projectId);
    const repoId = await this.resolveRepoIdForAction(
      config,
      'déclenchement du pipeline',
      preferredRepoId,
    );

    const pipeline = await this.apiService.triggerPipeline(
      config,
      repoId,
      branch,
      (url) => this.normalizeUrl(url),
    );

    await this.webhookService.upsertPipeline(projectId, pipeline);
    return pipeline;
  }

  async getRepos(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabRepoItem[]> {
    await this.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.getProjectConfig(projectId);

    if (config.sourceType === GitlabSourceType.GROUP) {
      return await this.apiService.fetchGroupRepositories(config, (url) =>
        this.normalizeUrl(url),
      );
    }

    const repoId = this.assertRepoSource(config, 'récupération du repository');
    return await this.apiService.getRepos(config, repoId, (url) =>
      this.normalizeUrl(url),
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

  resolveRegistryCredentials(config: GitlabConfig): RegistryCredentials {
    const deployToken = config.deployTokenValue
      ? this.cryptoService.decryptConfigToken(config.deployTokenValue)
      : '';
    const gitlabToken = this.cryptoService.decryptConfigToken(config.gitlabToken);
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

  async resolveRepositoryPath(
    config: GitlabConfig,
    fallbackProjectSlug: string,
    preferredRepoId?: number,
  ): Promise<string> {
    return await this.apiService.resolveRepositoryPath({
      config,
      fallbackProjectSlug,
      preferredRepoId,
      normalizeRepositoryPath: (value) => this.normalizeRepositoryPath(value),
      normalizeUrl: (value) => this.normalizeUrl(value),
      resolveRepoIdForAction: async (
        candidateConfig,
        action,
        selectedRepoId,
      ) =>
        await this.resolveRepoIdForAction(
          candidateConfig,
          action,
          selectedRepoId,
        ),
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

  private assertRepoSource(config: GitlabConfig, action: string): number {
    if (config.sourceType !== GitlabSourceType.REPO || !config.gitlabId) {
      throw new BadRequestException(
        `Action indisponible pour une source GROUP (${action})`,
      );
    }

    return Number(config.gitlabId);
  }

  private async resolveRepoIdForAction(
    config: GitlabConfig,
    action: string,
    preferredRepoId?: number,
  ): Promise<number> {
    if (config.sourceType === GitlabSourceType.REPO) {
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

    if (config.gitlabId && repoIds.includes(Number(config.gitlabId))) {
      return Number(config.gitlabId);
    }

    return repoIds[0];
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
