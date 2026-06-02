import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GitlabSourceType, PipelineStatus } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { GitlabCryptoService } from './gitlab-crypto.service';
import { GitlabPipelineItem } from './gitlab-api.service';
import {
  DEPLOYMENT_PIPELINE_UPDATED,
  DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
  type PipelineUpdatedEvent,
  type AutoDeployTriggerEvent,
} from '../../deployments/events/deployment.events';

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
    private readonly eventEmitter: EventEmitter2,
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

    const service = gitlabProjectId
      ? await this.prisma.projectService.findFirst({
          where: {
            projectId: config.projectId,
            gitlabProjectId: gitlabProjectId,
          },
          select: { id: true },
        })
      : null;

    const pipelineSnapshot = await this.upsertPipelineWithPreviousStatus(
      config.projectId,
      {
        id: pipelineId,
        status: webhookStatus,
        ref,
        sha,
        web_url: webUrl,
      },
      service?.id,
    );

    const transitionedToSuccess =
      pipelineSnapshot.currentStatus === PipelineStatus.SUCCESS &&
      pipelineSnapshot.previousStatus !== PipelineStatus.SUCCESS;

    // Emit via EventEmitter — decouples GitlabModule from DeploymentsModule
    const pipelineEvent: PipelineUpdatedEvent = { pipelineId, webhookStatus };
    await this.eventEmitter.emitAsync(DEPLOYMENT_PIPELINE_UPDATED, pipelineEvent);

    if (transitionedToSuccess) {
      const autoDeployEvent: AutoDeployTriggerEvent = {
        projectId: config.projectId,
        branch: ref,
        pipelineId,
        serviceId: service?.id,
      };
      await this.eventEmitter.emitAsync(DEPLOYMENT_AUTO_DEPLOY_TRIGGER, autoDeployEvent);
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
        const tokenBuf = Buffer.from(token);
        const expectedBuf = Buffer.from(expectedSecret);
        if (
          tokenBuf.length === expectedBuf.length &&
          timingSafeEqual(tokenBuf, expectedBuf)
        ) {
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
    serviceId?: string,
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
        serviceId,
      },
      create: {
        projectId,
        serviceId,
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
    serviceId?: string,
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

    await this.upsertPipeline(projectId, pipeline, serviceId);

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
