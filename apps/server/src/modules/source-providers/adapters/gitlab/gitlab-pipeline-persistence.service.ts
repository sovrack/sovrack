import { Injectable } from '@nestjs/common';
import { GitProviderType, PipelineRunStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { GitlabPipelineItem } from './gitlab.client';

/**
 * Persistance des PipelineRun GitLab — extrait de GitlabWebhookHandler (voir
 * EXPLORATION_GIT_BUILD_WEBHOOKS.md Sujet 3). Isolé dans son propre service
 * car consommé par 2 côtés qui ne doivent PAS dépendre l'un de l'autre :
 * `GitlabCiService` (reste dans source-providers/) et `GitlabWebhookHandler`
 * (déplacé dans webhooks/) — un import direct handler→ci ou ci→handler
 * aurait créé une dépendance source-providers↔webhooks non souhaitée.
 * Cette service ne dépend que de PrismaService, donc reste légitimement
 * dans source-providers/ et est exporté par GitlabModule/SourceProvidersModule
 * pour être consommé sans cycle depuis webhooks/.
 */
@Injectable()
export class GitlabPipelinePersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertPipeline(
    projectId: string,
    pipeline: GitlabPipelineItem,
  ): Promise<void> {
    await this.prisma.pipelineRun.upsert({
      where: {
        projectId_externalId_provider: {
          projectId,
          externalId: BigInt(pipeline.id),
          provider: GitProviderType.GITLAB,
        },
      },
      update: {
        status: this.mapPipelineStatus(pipeline.status),
        branch: pipeline.ref,
        commitSha: pipeline.sha ?? null,
        webUrl: pipeline.web_url ?? null,
      },
      create: {
        projectId,
        externalId: BigInt(pipeline.id),
        provider: GitProviderType.GITLAB,
        status: this.mapPipelineStatus(pipeline.status),
        branch: pipeline.ref,
        commitSha: pipeline.sha ?? null,
        webUrl: pipeline.web_url ?? null,
      },
    });
  }

  async upsertPipelineWithPreviousStatus(
    projectId: string,
    pipeline: GitlabPipelineItem,
  ): Promise<{
    previousStatus: PipelineRunStatus | null;
    currentStatus: PipelineRunStatus;
  }> {
    const currentStatus = this.mapPipelineStatus(pipeline.status);
    const existing = await this.prisma.pipelineRun.findUnique({
      where: {
        projectId_externalId_provider: {
          projectId,
          externalId: BigInt(pipeline.id),
          provider: GitProviderType.GITLAB,
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

  mapPipelineStatus(status?: string): PipelineRunStatus {
    switch ((status ?? '').toLowerCase()) {
      case 'pending':
        return PipelineRunStatus.PENDING;
      case 'running':
        return PipelineRunStatus.RUNNING;
      case 'success':
        return PipelineRunStatus.SUCCESS;
      case 'failed':
        return PipelineRunStatus.FAILED;
      case 'canceled':
      case 'cancelled':
        return PipelineRunStatus.CANCELED;
      default:
        return PipelineRunStatus.PENDING;
    }
  }
}
