import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SourceType } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import { GitlabClient } from './gitlab.client';
import { GitlabConnectionService } from './gitlab-connection.service';

/**
 * Résolution de la config projet/repo GitLab — extrait de GitlabAdapter
 * pour CASSER le cycle gitlab-core ↔ gitlab-ci.
 *
 * gitlab-core (impl IGitProvider) ET gitlab-ci (pipelines) dépendent tous
 * deux de CE service (sens unique) ; aucun ne dépend plus de l'autre pour la
 * config → plus de cycle. Logique déplacée VERBATIM (comportement identique).
 */
@Injectable()
export class GitlabProjectConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiService: GitlabClient,
    private readonly connection: GitlabConnectionService,
  ) {}

  async getProjectConfig(projectId: string): Promise<any> {
    const svc = await this.prisma.service.findFirst({
      where: { projectId, providerId: { not: null } },
    });
    if (!svc?.providerId) {
      throw new NotFoundException(
        'Configuration GitLab non trouvée pour ce projet',
      );
    }
    const gitProviderConfig = await this.prisma.gitProviderConfig.findUnique({
      where: { id: svc.providerId },
    });
    if (!gitProviderConfig) {
      throw new NotFoundException(
        'Configuration GitLab non trouvée pour ce projet',
      );
    }
    // Return combined data as any for backward compatibility
    return {
      ...gitProviderConfig,
      projectId,
      providerUrl: gitProviderConfig.providerUrl,
      providerToken: gitProviderConfig.adminToken || gitProviderConfig.oauthAccessToken || '',
      sourceType: svc.sourceType,
      // Inclure le repoPath du service : sans lui, assertRepoSource croyait que
      // tout service git était un « GROUP » (faux). Dans ce modèle TOUT est un
      // Service git à repoPath précis — le groupe ne sert qu'à la découverte.
      repoPath: svc.repoPath,
      defaultBranch: svc.branch,
      externalId: null,
      repoPathNamespace: null,
      externalGroupId: null,
      deployTokenUsername: null,
      deployTokenValue: null,
      webhookSecret: null,
      registryUrl: null,
      providerId: gitProviderConfig.id,
    } as any;
  }

  normalizeUrl(url: string): string {
    return this.connection.normalizeUrl(url);
  }

  assertRepoSource(config: any, action: string): number {
    if (config.sourceType !== SourceType.GIT || !config.repoPath) {
      throw new BadRequestException(
        `Action indisponible pour une source GROUP (${action})`,
      );
    }

    return Number(config.externalId);
  }

  async resolveRepoIdForAction(
    config: any,
    action: string,
    preferredRepoId?: number,
  ): Promise<number> {
    if (config.sourceType === SourceType.GIT) {
      return this.assertRepoSource(config, action);
    }

    const repos = await this.apiService.fetchGroupRepositories(config, (url) =>
      this.connection.normalizeUrl(url),
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

    if (config.externalId && repoIds.includes(Number(config.externalId))) {
      return Number(config.externalId);
    }

    return repoIds[0];
  }
}
