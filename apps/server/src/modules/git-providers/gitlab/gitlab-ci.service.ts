import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import {
  GitlabApiService,
  GitlabPipelineItem,
} from './gitlab-api.service';
import { GitlabCoreService } from './gitlab-core.service';
import { GitlabWebhookService } from './gitlab-webhook.service';

@Injectable()
export class GitlabCiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiService: GitlabApiService,
    private readonly webhookService: GitlabWebhookService,
    private readonly core: GitlabCoreService,
  ) {}

  async getPipelines(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabPipelineItem[]> {
    await this.core.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.core.getProjectConfig(projectId);
    const repoId = this.core.assertRepoSource(config, 'récupération des pipelines');

    const pipelines = await this.apiService.getPipelines(
      config,
      repoId,
      (url) => this.core.normalizeUrl(url),
    );

    for (const pipeline of pipelines) {
      await this.webhookService.upsertPipeline(projectId, pipeline);
    }

    return pipelines;
  }

  async getPipelinesForService(
    projectId: string,
    serviceId: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabPipelineItem[]> {
    await this.core.assertCanAccessProject(projectId, userId, userRole);

    const service = await this.prisma.projectService.findUnique({
      where: { id: serviceId },
      select: {
        id: true,
        projectId: true,
        gitlabProjectId: true,
        defaultBranch: true,
      },
    });

    if (!service || service.projectId !== projectId) {
      throw new NotFoundException('Service introuvable');
    }

    if (!service.gitlabProjectId) {
      return this.prisma.pipeline
        .findMany({
          where: { projectId, serviceId },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
        .then((rows) =>
          rows.map((p) => ({
            id: Number(p.gitlabId),
            status: p.status.toLowerCase(),
            ref: p.ref,
            sha: p.sha,
            web_url: p.webUrl,
          })),
        );
    }

    const config = await this.core.getProjectConfig(projectId);
    const pipelines = await this.apiService.getPipelines(
      config,
      Number(service.gitlabProjectId),
      (url) => this.core.normalizeUrl(url),
    );

    for (const pipeline of pipelines) {
      await this.webhookService.upsertPipeline(projectId, pipeline, serviceId);
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
    await this.core.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.core.getProjectConfig(projectId);
    const repoId = await this.core.resolveRepoIdForAction(
      config,
      'déclenchement du pipeline',
      preferredRepoId,
    );

    const pipeline = await this.apiService.triggerPipeline(
      config,
      repoId,
      branch,
      (url) => this.core.normalizeUrl(url),
    );

    await this.webhookService.upsertPipeline(projectId, pipeline);
    return pipeline;
  }
}
