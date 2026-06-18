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

  /** Historique CI persisté (pipelineRun) — repli sans appel réseau. */
  private async persistedPipelines(
    projectId: string,
  ): Promise<GitlabPipelineItem[]> {
    const rows = await this.prisma.pipelineRun.findMany({
      where: { projectId, provider: GitProviderType.GITLAB },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((p) => ({
      id: Number(p.externalId),
      status: p.status.toLowerCase(),
      ref: p.branch ?? '',
      sha: p.commitSha ?? '',
      web_url: p.webUrl ?? '',
    }));
  }

  /**
   * Pipelines au niveau PROJET : dans ce modèle 1 service = 1 repo, un projet
   * n'a pas de « dépôt unique » → on AGRÈGE les pipelines de tous les services
   * (best-effort : un dépôt qui échoue est ignoré, pas de 404 global). Repli sur
   * l'historique persisté si aucun appel live n'aboutit.
   */
  async getPipelines(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabPipelineItem[]> {
    await this.auth.assertCanAccessProject(projectId, userId, userRole);

    const services = await this.prisma.service.findMany({
      where: {
        projectId,
        providerId: { not: null },
        repoPath: { not: null },
      },
      select: { repoPath: true },
    });

    if (services.length === 0) {
      return this.persistedPipelines(projectId);
    }

    const config = await this.projectConfig.getProjectConfig(projectId);
    const seen = new Set<number>();
    const merged: GitlabPipelineItem[] = [];
    const repoPaths = Array.from(
      new Set(
        services
          .map((s) => s.repoPath)
          .filter((r): r is string => typeof r === 'string' && r.length > 0),
      ),
    );

    for (const repoPath of repoPaths) {
      try {
        const list = await this.apiService.getPipelines(
          config,
          repoPath,
          (url) => this.projectConfig.normalizeUrl(url),
        );
        for (const pipeline of list) {
          if (seen.has(pipeline.id)) continue;
          seen.add(pipeline.id);
          merged.push(pipeline);
          await this.webhookService.upsertPipeline(projectId, pipeline);
        }
      } catch {
        // Dépôt indisponible (droits/inexistant) → on l'ignore et on continue.
      }
    }

    if (merged.length === 0) {
      return this.persistedPipelines(projectId);
    }

    merged.sort((a, b) => b.id - a.id);
    return merged;
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
      return this.persistedPipelines(projectId);
    }

    const config = await this.projectConfig.getProjectConfig(projectId);
    let pipelines: GitlabPipelineItem[];
    try {
      pipelines = await this.apiService.getPipelines(
        config,
        repoIdentifier,
        (url) => this.projectConfig.normalizeUrl(url),
      );
    } catch {
      // Dépôt live indisponible → on n'échoue pas l'onglet, on montre l'historique.
      return this.persistedPipelines(projectId);
    }

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
