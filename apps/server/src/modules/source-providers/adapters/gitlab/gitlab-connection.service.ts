import { BadRequestException, Injectable } from '@nestjs/common';
import { SourceType } from '@prisma/client';
import { GitProviderConfigService } from '../../shared/connection/git-provider-config.service';
import { ConnectGitlabDto } from './dto/connect-gitlab.dto';
import { PublicGitlabConfig, GitlabResolvedConfig } from './gitlab.types';

export type GitlabConnectionInput = {
  gitlabUrl: string;
  gitlabToken: string;
  providerId: string | null;
};

@Injectable()
export class GitlabConnectionService {
  constructor(private readonly gitProviderRegistry: GitProviderConfigService) {}

  normalizeUrl(url: string): string {
    return url.trim().replace(/\/+$/, '');
  }

  normalizeOptionalString(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  normalizeGitlabIdentifier(
    value: number | string | undefined | null,
    label: string,
  ): string {
    if (typeof value === 'number') {
      if (Number.isInteger(value) && value > 0) {
        return String(value);
      }
      throw new BadRequestException(`${label} GitLab invalide`);
    }

    if (typeof value === 'string') {
      const normalized = value.trim().replace(/^\/+|\/+$/g, '');
      if (normalized.length > 0) {
        return normalized;
      }
    }

    throw new BadRequestException(`${label} GitLab est requis`);
  }

  resolveNumericGitlabId(
    apiId: number | undefined,
    identifier: string,
    label: string,
  ): number {
    if (Number.isInteger(apiId) && apiId !== undefined && apiId > 0) {
      return apiId;
    }

    const parsed = Number(identifier);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }

    throw new BadRequestException(
      `GitLab ${label}: impossible de résoudre un ID numérique depuis "${identifier}"`,
    );
  }

  normalizeRepositoryPath(value: string): string {
    let s = value
      .trim()
      .replace(/\.git$/i, '')
      .replace(/\/+$/, '');
    try {
      const url = new URL(s);
      s = url.pathname;
    } catch {
      if (s.includes('@') && s.includes(':')) {
        s = s.split(':').slice(1).join(':');
      }
    }
    return s.replace(/^\/+/, '').replace(/\/+$/, '');
  }

  toPublicConfig(config: GitlabResolvedConfig): PublicGitlabConfig {
    return {
      id: config.id ?? '',
      gitlabUrl: config.providerUrl,
      gitlabId: config.externalId != null ? Number(config.externalId) : null,
      gitlabGroupId:
        config.externalGroupId != null ? Number(config.externalGroupId) : null,
      defaultBranch: config.defaultBranch ?? 'main',
      sourceType: config.sourceType ?? SourceType.GIT,
      providerId: config.providerId ?? null,
      deployTokenUsername: config.deployTokenUsername ?? null,
      registryUrl: config.registryUrl ?? null,
      gitlabToken: '***',
      deployTokenValue: config.deployTokenValue ? '***' : '',
      webhookSecretConfigured: Boolean(config.webhookSecret),
      projectId: config.projectId ?? '',
      createdAt: config.createdAt ?? new Date(),
      updatedAt: config.updatedAt ?? new Date(),
    };
  }

  async resolveGitlabConnectionInput(
    dto: ConnectGitlabDto,
  ): Promise<GitlabConnectionInput> {
    const manualUrl = this.normalizeOptionalString(dto.gitlabUrl);
    const manualToken = this.normalizeOptionalString(dto.gitlabToken);

    if (dto.providerId) {
      if (manualToken) {
        const providers =
          await this.gitProviderRegistry.listGitlabProvidersForProjects();
        const provider = providers.find((p) => p.id === dto.providerId);
        const providerUrl = provider?.providerUrl ?? 'https://gitlab.com';
        return {
          gitlabUrl: manualUrl ?? providerUrl,
          gitlabToken: manualToken,
          providerId: dto.providerId,
        };
      }

      const providerCredentials =
        await this.gitProviderRegistry.resolveGitlabCredentials(dto.providerId);

      return {
        gitlabUrl: manualUrl ?? providerCredentials.providerUrl,
        gitlabToken: providerCredentials.token,
        providerId: providerCredentials.providerId,
      };
    }

    if (manualUrl && manualToken) {
      return {
        gitlabUrl: manualUrl,
        gitlabToken: manualToken,
        providerId: null,
      };
    }

    if (manualUrl || manualToken) {
      throw new BadRequestException(
        'Fournissez gitlabUrl + gitlabToken ensemble, ou utilisez providerId',
      );
    }

    const defaultProviderCredentials =
      await this.gitProviderRegistry.resolveGitlabCredentials();

    return {
      gitlabUrl: defaultProviderCredentials.providerUrl,
      gitlabToken: defaultProviderCredentials.token,
      providerId: defaultProviderCredentials.providerId,
    };
  }
}
