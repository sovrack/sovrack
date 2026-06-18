import { Injectable, NotFoundException } from '@nestjs/common';
import { GitProviderType, Role } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import { GitlabClient, GitlabPipelineItem } from './gitlab.client';
import { GitlabAuthorizationService } from './gitlab-authorization.service';
import { GitlabProjectConfigService } from './gitlab-project-config.service';
import { GitlabWebhookHandler } from './gitlab-webhook.handler';

@Injectable()
export class GitlabCiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiService: GitlabClient,
    private readonly webhookService: GitlabWebhookHandler,
    private readonly projectConfig: GitlabProjectConfigService,
    private readonly auth: GitlabAuthorizationService,
  ) {}

  async getPipelines(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabPipelineItem[]> {
    await this.auth.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.projectConfig.getProjectConfig(projectId);
    const repoId = this.projectConfig.assertRepoSource(
      config,
      'récupération des pipelines',
    );

    const pipelines = await this.apiService.getPipelines(
      config,
      repoId,
      (url) => this.projectConfig.normalizeUrl(url),
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
    await this.auth.assertCanAccessProject(projectId, userId, userRole);

    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, providerId: true, branch: true, repoPath: true },
    });

    if (!service) {
      throw new NotFoundException('Service introuvable');
    }

    // Modèle 1 service = 1 repo : on identifie le dépôt par LE repoPath du
    // service (et non un GitProviderRepo « au hasard » du provider, qui pouvait
    // viser un autre service). GitLab accepte le chemin URL-encodé.
    const repoIdentifier =
      service.repoPath ??
      (service.providerId
        ? (
            await this.prisma.gitProviderRepo.findFirst({
              where: { providerId: service.providerId },
              select: { repoPath: true },
            })
          )?.repoPath
        : null);

    if (!repoIdentifier) {
      // Pas de dépôt résolu → on retombe sur l'historique persisté (pipelineRun).
      return this.prisma.pipelineRun
        .findMany({
          where: { projectId, provider: GitProviderType.GITLAB },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
        .then((rows) =>
          rows.map((p) => ({
            id: Number(p.externalId),
            status: p.status.toLowerCase(),
            ref: p.branch ?? '',
            sha: p.commitSha ?? '',
            web_url: p.webUrl ?? '',
          })),
        );
    }

    const config = await this.projectConfig.getProjectConfig(projectId);
    const pipelines = await this.apiService.getPipelines(
      config,
      repoIdentifier,
      (url) => this.projectConfig.normalizeUrl(url),
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
    await this.auth.assertCanAccessProject(projectId, userId, userRole);
    const config = await this.projectConfig.getProjectConfig(projectId);
    const repoId = await this.projectConfig.resolveRepoIdForAction(
      config,
      'déclenchement du pipeline',
      preferredRepoId,
    );

    const pipeline = await this.apiService.triggerPipeline(
      config,
      repoId,
      branch,
      (url) => this.projectConfig.normalizeUrl(url),
    );

    await this.webhookService.upsertPipeline(projectId, pipeline);
    return pipeline;
  }
}
