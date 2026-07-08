import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import { SourceType } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import type { GitlabResolvedConfig } from './gitlab.types';
import type { GitlabPipelineItem } from '../../contracts/gitlab-pipeline.types';
import {
  parseNullableHeaderInt,
  throwGitlabRequestError,
} from './gitlab-pagination.helper';

export type { GitlabPipelineItem } from '../../contracts/gitlab-pipeline.types';

export type GitlabBranchItem = Record<string, unknown>;

export type GitlabRepoItem = {
  id?: number;
  name?: string;
  path?: string;
  path_with_namespace?: string;
  pathWithNamespace?: string;
  default_branch?: string | null;
  defaultBranch?: string | null;
  web_url?: string;
  webUrl?: string;
  description?: string | null;
  last_activity_at?: string | null;
  lastActivityAt?: string | null;
  visibility?: string;
  archived?: boolean;
  language?: string | null;
  namespace?: {
    full_path?: string;
    path?: string;
  };
};

export type GitlabGroupRepositoriesQuery = {
  page?: number;
  perPage?: number;
  search?: string;
  visibility?: string;
  archived?: boolean;
  includeSubgroups?: boolean;
};

export type GitlabGroupRepositoriesPage = {
  items: GitlabRepoItem[];
  pagination: {
    page: number;
    perPage: number;
    total: number | null;
    totalPages: number | null;
  };
};

type GitlabProjectSummary = {
  id?: number;
  default_branch?: string | null;
  web_url?: string | null;
  path_with_namespace?: string;
  path?: string;
  namespace?: {
    full_path?: string;
  };
};

type GitlabGroupSummary = {
  id?: number;
  full_path?: string;
  path?: string;
};

@Injectable()
export class GitlabClient {
  constructor(
    private readonly httpService: HttpService,
    private readonly crypto: CryptoService,
  ) {}

  private normalizeBaseUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }

  private async getByConnection<T>(
    baseUrl: string,
    gitlabToken: string,
    path: string,
    errorLabel: string,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(`${this.normalizeBaseUrl(baseUrl)}${path}`, {
          headers: { 'PRIVATE-TOKEN': gitlabToken },
        }),
      );
      return response.data;
    } catch (error: unknown) {
      throwGitlabRequestError(errorLabel, error);
    }
  }

  private async fetchProjectPath(
    normalizeUrl: (url: string) => string,
    gitlabToken: string,
    providerUrl: string,
    projectId: number | string,
    normalizeRepositoryPath: (value: string) => string,
  ): Promise<string | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<GitlabProjectSummary>(
          `${normalizeUrl(providerUrl)}/api/v4/projects/${encodeURIComponent(String(projectId))}`,
          { headers: { 'PRIVATE-TOKEN': gitlabToken } },
        ),
      );
      const fullPath = response.data.path_with_namespace;
      if (typeof fullPath === 'string' && fullPath.trim()) {
        return normalizeRepositoryPath(fullPath);
      }
      const namespacePath = response.data.namespace?.full_path;
      const repoPath = response.data.path;
      if (
        typeof namespacePath === 'string' &&
        namespacePath.trim() &&
        typeof repoPath === 'string' &&
        repoPath.trim()
      ) {
        return normalizeRepositoryPath(`${namespacePath}/${repoPath}`);
      }
    } catch {
      // Best-effort lookup — fall through to the null return below.
    }
    return null;
  }

  async getBranches(
    config: GitlabResolvedConfig,
    repoId: number | string,
    normalizeUrl: (url: string) => string,
  ): Promise<GitlabBranchItem[]> {
    const gitlabToken = this.crypto.decrypt(config.providerToken);

    try {
      const response = await firstValueFrom(
        this.httpService.get<GitlabBranchItem[]>(
          `${normalizeUrl(config.providerUrl)}/api/v4/projects/${encodeURIComponent(String(repoId))}/repository/branches`,
          {
            headers: {
              'PRIVATE-TOKEN': gitlabToken,
            },
          },
        ),
      );

      return response.data;
    } catch (error: unknown) {
      throwGitlabRequestError('récupération des branches', error);
    }
  }

  async getPipelines(
    config: GitlabResolvedConfig,
    repoId: number | string,
    normalizeUrl: (url: string) => string,
  ): Promise<GitlabPipelineItem[]> {
    const gitlabToken = this.crypto.decrypt(config.providerToken);

    try {
      const response = await firstValueFrom(
        this.httpService.get<GitlabPipelineItem[]>(
          `${normalizeUrl(config.providerUrl)}/api/v4/projects/${encodeURIComponent(String(repoId))}/pipelines`,
          {
            headers: {
              'PRIVATE-TOKEN': gitlabToken,
            },
          },
        ),
      );

      return response.data;
    } catch (error: unknown) {
      throwGitlabRequestError('récupération des pipelines', error);
    }
  }

  async triggerPipeline(
    config: GitlabResolvedConfig,
    repoId: number | string,
    branch: string,
    normalizeUrl: (url: string) => string,
  ): Promise<GitlabPipelineItem> {
    const gitlabToken = this.crypto.decrypt(config.providerToken);

    try {
      const response = await firstValueFrom(
        this.httpService.post<GitlabPipelineItem>(
          `${normalizeUrl(config.providerUrl)}/api/v4/projects/${encodeURIComponent(String(repoId))}/pipeline`,
          { ref: branch },
          {
            headers: {
              'PRIVATE-TOKEN': gitlabToken,
            },
          },
        ),
      );

      return response.data;
    } catch (error: unknown) {
      throwGitlabRequestError(`déclenchement du pipeline (${branch})`, error);
    }
  }

  async getRepos(
    config: GitlabResolvedConfig,
    repoId: number | string,
    normalizeUrl: (url: string) => string,
  ): Promise<GitlabRepoItem[]> {
    const gitlabToken = this.crypto.decrypt(config.providerToken);
    try {
      const response = await firstValueFrom(
        this.httpService.get<GitlabRepoItem>(
          `${normalizeUrl(config.providerUrl)}/api/v4/projects/${encodeURIComponent(String(repoId))}`,
          {
            headers: {
              'PRIVATE-TOKEN': gitlabToken,
            },
          },
        ),
      );
      return [response.data];
    } catch (error: unknown) {
      throwGitlabRequestError('récupération du repository', error);
    }
  }

  async fetchGroupRepositories(
    config: GitlabResolvedConfig,
    normalizeUrl: (url: string) => string,
  ): Promise<GitlabRepoItem[]> {
    if (!config.externalGroupId) {
      throw new BadRequestException('Aucun gitlabGroupId configuré');
    }

    const gitlabToken = this.crypto.decrypt(config.providerToken);

    try {
      const response = await firstValueFrom(
        this.httpService.get<GitlabRepoItem[]>(
          `${normalizeUrl(config.providerUrl)}/api/v4/groups/${encodeURIComponent(String(config.externalGroupId))}/projects`,
          {
            headers: {
              'PRIVATE-TOKEN': gitlabToken,
            },
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      throwGitlabRequestError('récupération des repositories du groupe', error);
    }
  }

  async resolveRepositoryPath(params: {
    config: GitlabResolvedConfig;
    fallbackProjectSlug: string;
    preferredRepoId?: number;
    normalizeRepositoryPath: (value: string) => string;
    normalizeUrl: (value: string) => string;
    resolveRepoIdForAction: (
      config: GitlabResolvedConfig,
      action: string,
      preferredRepoId?: number,
    ) => Promise<number | string>;
  }): Promise<string> {
    const {
      config,
      fallbackProjectSlug,
      preferredRepoId,
      normalizeRepositoryPath,
      normalizeUrl,
      resolveRepoIdForAction,
    } = params;

    const normalizedFallback = normalizeRepositoryPath(fallbackProjectSlug);

    if (config.sourceType === SourceType.GIT && config.externalId) {
      const gitlabToken = this.crypto.decrypt(config.providerToken);
      const path = await this.fetchProjectPath(
        normalizeUrl,
        gitlabToken,
        config.providerUrl,
        config.externalId,
        normalizeRepositoryPath,
      );
      if (path) return path;
      return `project-${String(config.externalId)}/${normalizedFallback}`;
    }

    if (config.sourceType === SourceType.GIT && config.externalGroupId) {
      const gitlabToken = this.crypto.decrypt(config.providerToken);
      const targetRepoId = await resolveRepoIdForAction(
        config,
        "résolution du repository pour l'image Docker",
        preferredRepoId,
      );

      const path = await this.fetchProjectPath(
        normalizeUrl,
        gitlabToken,
        config.providerUrl,
        targetRepoId,
        normalizeRepositoryPath,
      );
      if (path) return path;

      try {
        const response = await firstValueFrom(
          this.httpService.get<GitlabGroupSummary>(
            `${normalizeUrl(config.providerUrl)}/api/v4/groups/${encodeURIComponent(String(config.externalGroupId))}`,
            { headers: { 'PRIVATE-TOKEN': gitlabToken } },
          ),
        );
        const groupPath =
          typeof response.data.full_path === 'string' &&
          response.data.full_path.trim()
            ? response.data.full_path
            : response.data.path;
        if (typeof groupPath === 'string' && groupPath.trim()) {
          return normalizeRepositoryPath(`${groupPath}/${normalizedFallback}`);
        }
      } catch {
        // Best-effort lookup — fall through to the fallback path below.
      }

      return `group-${String(config.externalGroupId)}/${normalizedFallback}`;
    }

    return normalizedFallback;
  }

  async validateGitlabRepoConnection(
    baseUrl: string,
    gitlabId: number | string,
    gitlabToken: string,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.get(
          `${baseUrl}/api/v4/projects/${encodeURIComponent(String(gitlabId))}`,
          {
            headers: {
              'PRIVATE-TOKEN': gitlabToken,
            },
          },
        ),
      );
    } catch (error: unknown) {
      throwGitlabRequestError('connexion GitLab repository', error);
    }
  }

  async validateGitlabGroupConnection(
    baseUrl: string,
    gitlabGroupId: number | string,
    gitlabToken: string,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.get(
          `${baseUrl}/api/v4/groups/${encodeURIComponent(String(gitlabGroupId))}`,
          {
            headers: {
              'PRIVATE-TOKEN': gitlabToken,
            },
          },
        ),
      );
    } catch (error: unknown) {
      throwGitlabRequestError('connexion GitLab group', error);
    }
  }

  async getProjectByConnection(
    baseUrl: string,
    gitlabProjectId: number | string,
    gitlabToken: string,
  ): Promise<GitlabProjectSummary> {
    return this.getByConnection<GitlabProjectSummary>(
      baseUrl,
      gitlabToken,
      `/api/v4/projects/${encodeURIComponent(String(gitlabProjectId))}`,
      'connexion GitLab repository',
    );
  }

  async listProjectBranchesByConnection(
    baseUrl: string,
    gitlabProjectId: number | string,
    gitlabToken: string,
  ): Promise<GitlabBranchItem[]> {
    return this.getByConnection<GitlabBranchItem[]>(
      baseUrl,
      gitlabToken,
      `/api/v4/projects/${encodeURIComponent(String(gitlabProjectId))}/repository/branches`,
      'vérification de la branche par défaut',
    );
  }

  async listGroupRepositoriesByConnection(
    baseUrl: string,
    gitlabGroupId: number | string,
    gitlabToken: string,
    query?: GitlabGroupRepositoriesQuery,
  ): Promise<GitlabRepoItem[]> {
    const page = await this.listGroupRepositoriesPageByConnection(
      baseUrl,
      gitlabGroupId,
      gitlabToken,
      query,
    );
    return page.items;
  }

  async listGroupRepositoriesPageByConnection(
    baseUrl: string,
    gitlabGroupId: number | string,
    gitlabToken: string,
    query?: GitlabGroupRepositoriesQuery,
  ): Promise<GitlabGroupRepositoriesPage> {
    try {
      const params: Record<string, string | number | boolean> = {
        page: query?.page ?? 1,
        per_page: query?.perPage ?? 20,
        order_by: 'last_activity_at',
        sort: 'desc',
        simple: true,
        include_subgroups: query?.includeSubgroups ?? true,
      };

      if (query?.search?.trim()) {
        params.search = query.search.trim();
      }
      if (query?.visibility?.trim()) {
        params.visibility = query.visibility.trim();
      }
      if (typeof query?.archived === 'boolean') {
        params.archived = query.archived;
      }

      const response = await firstValueFrom(
        this.httpService.get<GitlabRepoItem[]>(
          `${this.normalizeBaseUrl(baseUrl)}/api/v4/groups/${encodeURIComponent(String(gitlabGroupId))}/projects`,
          {
            headers: {
              'PRIVATE-TOKEN': gitlabToken,
            },
            params,
          },
        ),
      );
      return {
        items: response.data,
        pagination: {
          page: Number(response.headers['x-page'] ?? params.page),
          perPage: Number(response.headers['x-per-page'] ?? params.per_page),
          total: parseNullableHeaderInt(response.headers['x-total']),
          totalPages: parseNullableHeaderInt(response.headers['x-total-pages']),
        },
      };
    } catch (error: unknown) {
      throwGitlabRequestError('récupération des repositories du groupe', error);
    }
  }

  async getGroupByConnection(
    baseUrl: string,
    gitlabGroupId: number | string,
    gitlabToken: string,
  ): Promise<GitlabGroupSummary> {
    return this.getByConnection<GitlabGroupSummary>(
      baseUrl,
      gitlabToken,
      `/api/v4/groups/${encodeURIComponent(String(gitlabGroupId))}`,
      'connexion GitLab group',
    );
  }
}
