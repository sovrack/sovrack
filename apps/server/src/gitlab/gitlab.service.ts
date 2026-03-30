import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PipelineStatus,
  ProjectMemberRole,
  Role,
  type GitlabConfig,
} from '@prisma/client';
import { firstValueFrom } from 'rxjs';
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

@Injectable()
export class GitlabService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

  // Connecte un projet local a un projet GitLab externe.
  async connectProject(
    projectId: string,
    dto: ConnectGitlabDto,
    userId: string,
    userRole: Role,
  ): Promise<Omit<GitlabConfig, 'gitlabToken'> & { gitlabToken: string }> {
    await this.assertCanManageProject(projectId, userId, userRole);

    const baseUrl = this.normalizeUrl(dto.gitlabUrl);
    const defaultBranch = dto.defaultBranch ?? 'main';

    try {
      await firstValueFrom(
        this.httpService.get(
          `${baseUrl}/api/v4/projects/${encodeURIComponent(String(dto.gitlabId))}`,
          {
            headers: {
              'PRIVATE-TOKEN': dto.gitlabToken,
            },
          },
        ),
      );
    } catch {
      throw new BadRequestException('Connexion GitLab échouée');
    }

    const config = await this.prisma.gitlabConfig.upsert({
      where: { projectId },
      update: {
        gitlabUrl: baseUrl,
        gitlabToken: dto.gitlabToken,
        gitlabId: dto.gitlabId,
        defaultBranch,
      },
      create: {
        projectId,
        gitlabUrl: baseUrl,
        gitlabToken: dto.gitlabToken,
        gitlabId: dto.gitlabId,
        defaultBranch,
      },
    });

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        gitlabUrl: baseUrl,
        gitlabId: dto.gitlabId,
        branch: defaultBranch,
      },
    });

    return this.maskConfigToken(config);
  }

  // Retourne les branches GitLab pour un projet autorise.
  async getBranches(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabBranchItem[]> {
    await this.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.getProjectConfig(projectId);

    const response = await firstValueFrom(
      this.httpService.get<GitlabBranchItem[]>(
        `${this.normalizeUrl(config.gitlabUrl)}/api/v4/projects/${encodeURIComponent(String(config.gitlabId))}/repository/branches`,
        {
          headers: {
            'PRIVATE-TOKEN': config.gitlabToken,
          },
        },
      ),
    );

    return response.data;
  }

  // Recupere les pipelines GitLab, puis synchronise en base locale.
  async getPipelines(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabPipelineItem[]> {
    await this.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.getProjectConfig(projectId);

    const response = await firstValueFrom(
      this.httpService.get<GitlabPipelineItem[]>(
        `${this.normalizeUrl(config.gitlabUrl)}/api/v4/projects/${encodeURIComponent(String(config.gitlabId))}/pipelines`,
        {
          headers: {
            'PRIVATE-TOKEN': config.gitlabToken,
          },
        },
      ),
    );

    for (const pipeline of response.data) {
      await this.upsertPipeline(projectId, pipeline);
    }

    return response.data;
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

    const response = await firstValueFrom(
      this.httpService.post<GitlabPipelineItem>(
        `${this.normalizeUrl(config.gitlabUrl)}/api/v4/projects/${encodeURIComponent(String(config.gitlabId))}/pipeline`,
        { ref: branch },
        {
          headers: {
            'PRIVATE-TOKEN': config.gitlabToken,
          },
        },
      ),
    );

    await this.upsertPipeline(projectId, response.data);
    return response.data;
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
      where: { gitlabId: gitlabProjectId },
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

    return { status: 'ok' };
  }

  // Retourne la config GitLab en masquant le token.
  async getGitlabConfig(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<Omit<GitlabConfig, 'gitlabToken'> & { gitlabToken: string }> {
    await this.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.getProjectConfig(projectId);
    return this.maskConfigToken(config);
  }

  verifyWebhookToken(token?: string) {
    if (!token) {
      throw new ForbiddenException('Token webhook GitLab manquant');
    }

    if (token !== process.env.GITLAB_TOKEN) {
      throw new ForbiddenException('Token webhook GitLab invalide');
    }
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

  private maskConfigToken(config: GitlabConfig) {
    return {
      ...config,
      gitlabToken: '***',
    };
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
