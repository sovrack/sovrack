import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { GitlabSourceType, PipelineStatus } from '@prisma/client';
import { DeploymentsService } from '../deployments/deployments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GitlabCryptoService } from './gitlab-crypto.service';
import { GitlabPipelineItem } from './gitlab-api.service';

export type GitlabWebhookPayload = {
  object_kind?: string;
  event_name?: string;
  group_id?: number;
  project_id?: number;
  project?: {
    id?: number;
    namespace_id?: number;
    namespace?: {
      id?: number;
    };
  };
  object_attributes?: {
    id?: number;
    status?: string;
    ref?: string;
    sha?: string;
    url?: string;
    web_url?: string;
  };
};

@Injectable()
export class GitlabWebhookService {
  private readonly logger = new Logger(GitlabWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: GitlabCryptoService,
    @Optional()
    @Inject(forwardRef(() => DeploymentsService))
    private readonly deploymentsService?: DeploymentsService,
  ) {}

  async handleWebhook(
    payload: GitlabWebhookPayload,
  ): Promise<{ status: 'ignored' | 'ok' }> {
    const isPipelineEvent =
      payload.object_kind === 'pipeline' || payload.event_name === 'pipeline';

    if (!isPipelineEvent) {
      return { status: 'ignored' };
    }

    const gitlabProjectId = payload.project_id ?? payload.project?.id ?? null;
    const gitlabGroupId = this.extractWebhookGroupId(
      payload as Record<string, unknown>,
    );
    const pipelineId = payload.object_attributes?.id;

    if (!pipelineId || (!gitlabProjectId && !gitlabGroupId)) {
      return { status: 'ignored' };
    }

    const config = await this.prisma.gitlabConfig.findFirst({
      where: {
        OR: [
          ...(gitlabProjectId
            ? [
                {
                  sourceType: GitlabSourceType.REPO,
                  gitlabId: gitlabProjectId,
                },
              ]
            : []),
          ...(gitlabGroupId
            ? [
                {
                  sourceType: GitlabSourceType.GROUP,
                  gitlabGroupId,
                },
              ]
            : []),
        ],
      },
    });

    if (!config) {
      return { status: 'ignored' };
    }

    const webhookStatus = payload.object_attributes?.status ?? 'pending';
    const ref = payload.object_attributes?.ref ?? config.defaultBranch;
    const sha = payload.object_attributes?.sha ?? '';
    const webUrl =
      payload.object_attributes?.web_url ??
      payload.object_attributes?.url ??
      '';

    const pipelineSnapshot = await this.upsertPipelineWithPreviousStatus(
      config.projectId,
      {
        id: pipelineId,
        status: webhookStatus,
        ref,
        sha,
        web_url: webUrl,
      },
    );

    const transitionedToSuccess =
      pipelineSnapshot.currentStatus === PipelineStatus.SUCCESS &&
      pipelineSnapshot.previousStatus !== PipelineStatus.SUCCESS;

    if (this.deploymentsService) {
      const result = await this.deploymentsService.handleWebhookUpdate(
        pipelineId,
        webhookStatus,
      );

      // Si aucun déploiement existant ne correspond, vérifier l'auto-deploy
      if (result.status === 'ignored' && transitionedToSuccess) {
        await this.deploymentsService.triggerAutoDeployIfConfigured(
          config.projectId,
          ref,
          undefined,
          pipelineId,
        );
      }
    }

    return { status: 'ok' };
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
            {
              sourceType: GitlabSourceType.REPO,
              gitlabId: id,
            },
            {
              sourceType: GitlabSourceType.GROUP,
              gitlabGroupId: id,
            },
          ]),
        },
      });

      if (config?.webhookSecret) {
        const expectedSecret = this.crypto.decryptConfigToken(
          config.webhookSecret,
        );
        if (token === expectedSecret) {
          return;
        }
      }

      throw new ForbiddenException('Token webhook GitLab invalide');
    }

    throw new ForbiddenException('Token webhook GitLab invalide');
  }

  extractWebhookProjectId(payload?: Record<string, unknown>): number | null {
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

  extractWebhookGroupId(payload?: Record<string, unknown>): number | null {
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

  async upsertPipeline(
    projectId: string,
    pipeline: GitlabPipelineItem,
  ): Promise<void> {
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

  async upsertPipelineWithPreviousStatus(
    projectId: string,
    pipeline: GitlabPipelineItem,
  ): Promise<{
    previousStatus: PipelineStatus | null;
    currentStatus: PipelineStatus;
  }> {
    const currentStatus = this.mapPipelineStatus(pipeline.status);
    const existing = await this.prisma.pipeline.findUnique({
      where: {
        projectId_gitlabId: {
          projectId,
          gitlabId: pipeline.id,
        },
      },
      select: {
        status: true,
      },
    });

    await this.upsertPipeline(projectId, pipeline);

    return {
      previousStatus: existing?.status ?? null,
      currentStatus,
    };
  }

  mapPipelineStatus(status?: string): PipelineStatus {
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
}
