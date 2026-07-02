import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { activeWhere } from '../../../../shared/database/prisma-active.helper';
import { sanitizeDockerTag } from '../../../../shared/utils/docker-tag.util';
import type { GitlabResolvedConfig } from './gitlab.types';
import { GitlabClient } from './gitlab.client';
import { GitlabConnectionService } from './gitlab-connection.service';
import { GitlabCredentialService } from './gitlab-credential.service';
import { GitlabProjectConfigService } from './gitlab-project-config.service';

/**
 * Résolution de config GitLab + référence d'image Docker, extrait de
 * GitlabAdapter — voir EXPLORATION_BACKEND_DEPENDANCES.md section 4.
 * `loadResolvedConfig` était la seule méthode privée de l'adapter ; elle
 * devient publique ici puisqu'appelée depuis GitlabAdapter (resolveRegistry
 * Credentials/resolveRepositoryPath, restés dans l'adapter) ET en interne par
 * resolveDockerImageRef.
 */
@Injectable()
export class GitlabImageRefService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credential: GitlabCredentialService,
    private readonly apiService: GitlabClient,
    private readonly connection: GitlabConnectionService,
    private readonly projectConfig: GitlabProjectConfigService,
  ) {}

  /** Loads a GitlabResolvedConfig for the first service in the project that has
   * a provider. Throws NotFoundException when no provider config exists. */
  async loadResolvedConfig(projectId: string): Promise<{
    config: GitlabResolvedConfig;
    svc: { repoPath: string | null; name: string | null };
  }> {
    const svc = await this.prisma.service.findFirst({
      where: activeWhere({ projectId, providerId: { not: null } }),
      select: {
        providerId: true,
        sourceType: true,
        branch: true,
        repoPath: true,
        name: true,
      },
    });
    if (!svc?.providerId)
      throw new NotFoundException(
        `Aucune config GitLab pour le projet ${projectId}`,
      );

    const gitProviderConfig = await this.prisma.gitProviderConfig.findUnique({
      where: { id: svc.providerId },
    });
    if (!gitProviderConfig)
      throw new NotFoundException(
        `Aucune config GitLab pour le projet ${projectId}`,
      );

    const config: GitlabResolvedConfig = {
      ...gitProviderConfig,
      projectId,
      providerUrl: gitProviderConfig.providerUrl,
      providerToken:
        gitProviderConfig.adminToken ||
        gitProviderConfig.oauthAccessToken ||
        '',
      sourceType: svc.sourceType,
      defaultBranch: svc.branch,
      externalId: null,
      repoPathNamespace: null,
      externalGroupId: null,
      deployTokenUsername: null,
      deployTokenValue: null,
      webhookSecret: null,
      registryUrl: null,
      providerId: gitProviderConfig.id,
    };
    return { config, svc };
  }

  async resolveRepositoryPathFromConfig(
    config: GitlabResolvedConfig,
    fallbackProjectSlug: string,
    preferredRepoId?: number,
  ): Promise<string> {
    return await this.apiService.resolveRepositoryPath({
      config,
      fallbackProjectSlug,
      preferredRepoId,
      normalizeRepositoryPath: (value) =>
        this.connection.normalizeRepositoryPath(value),
      normalizeUrl: (value) => this.connection.normalizeUrl(value),
      resolveRepoIdForAction: async (candidateConfig, action, selectedRepoId) =>
        await this.projectConfig.resolveRepoIdForAction(
          candidateConfig,
          action,
          selectedRepoId,
        ),
    });
  }

  async resolveDockerImageRef(
    projectId: string,
    branch: string,
    serviceId?: string,
  ): Promise<string> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });
    const slug = sanitizeDockerTag(project?.name ?? projectId);
    const tag = sanitizeDockerTag(branch);

    let resolvedConfig: Awaited<ReturnType<typeof this.loadResolvedConfig>>;
    try {
      resolvedConfig = await this.loadResolvedConfig(projectId);
    } catch {
      return `${slug}:${tag}`;
    }
    const { config, svc } = resolvedConfig;

    let projectSlug = slug;
    if (serviceId) {
      const svcDetail = await this.prisma.service.findUnique({
        where: { id: serviceId },
        select: { name: true },
      });
      if (svcDetail?.name)
        projectSlug = `${slug}-${sanitizeDockerTag(svcDetail.name)}`;
    }

    const registryHost = this.credential.resolveRegistryHost(
      config.providerUrl,
      config.providerUrl,
    );
    const repoPath = await this.resolveRepositoryPathFromConfig(
      config,
      projectSlug,
      undefined,
    );
    const finalPath =
      this.credential.isPlaceholderPath(config, repoPath) && svc?.repoPath
        ? (this.credential.extractPathFromUrl(svc.repoPath) ?? repoPath)
        : repoPath;

    return `${registryHost}/${finalPath}:${tag}`;
  }
}
