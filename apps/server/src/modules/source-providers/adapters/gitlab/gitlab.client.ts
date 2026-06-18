import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import { SourceType } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { CryptoService } from '../../../../core/crypto/crypto.service';

export type GitlabPipelineItem = {
  id: number;
  status: string;
  ref: string;
  sha: string;
  web_url: string;
};

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

  async getBranches(
    config: any,
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
      this.throwGitlabRequestError('récupération des branches', error);
    }
  }

  async getPipelines(
    config: any,
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
      this.throwGitlabRequestError('récupération des pipelines', error);
    }
  }

  async triggerPipeline(
    config: any,
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
      this.throwGitlabRequestError(
        `déclenchement du pipeline (${branch})`,
        error,
      );
    }
  }

  async getRepos(
    config: any,
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
      this.throwGitlabRequestError('récupération du repository', error);
    }
  }

  async fetchGroupRepositories(
    config: any,
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
      this.throwGitlabRequestError(
        'récupération des repositories du groupe',
        error,
      );
    }
  }

  async resolveRepositoryPath(params: {
    config: any;
    fallbackProjectSlug: string;
    preferredRepoId?: number;
    normalizeRepositoryPath: (value: string) => string;
    normalizeUrl: (value: string) => string;
    resolveRepoIdForAction: (
      config: any,
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

      try {
        const response = await firstValueFrom(
          this.httpService.get<GitlabProjectSummary>(
            `${normalizeUrl(config.providerUrl)}/api/v4/projects/${encodeURIComponent(String(config.externalId))}`,
            {
              headers: {
                'PRIVATE-TOKEN': gitlabToken,
              },
            },
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
        // Fallback silencieux.
      }

      return `project-${String(config.externalId)}/${normalizedFallback}`;
    }

    if (config.sourceType === SourceType.GIT && config.externalGroupId) {
      const gitlabToken = this.crypto.decrypt(config.providerToken);
      const targetRepoId = await resolveRepoIdForAction(
        config,
        "résolution du repository pour l'image Docker",
        preferredRepoId,
      );

      try {
        const response = await firstValueFrom(
          this.httpService.get<GitlabProjectSummary>(
            `${normalizeUrl(config.providerUrl)}/api/v4/projects/${encodeURIComponent(String(targetRepoId))}`,
            {
              headers: {
                'PRIVATE-TOKEN': gitlabToken,
              },
            },
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
        // Fallback silencieux.
      }

      try {
        const response = await firstValueFrom(
          this.httpService.get<GitlabGroupSummary>(
            `${normalizeUrl(config.providerUrl)}/api/v4/groups/${encodeURIComponent(String(config.externalGroupId))}`,
            {
              headers: {
                'PRIVATE-TOKEN': gitlabToken,
              },
            },
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
        // Fallback silencieux.
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
      this.throwGitlabRequestError('connexion GitLab repository', error);
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
      this.throwGitlabRequestError('connexion GitLab group', error);
    }
  }

  async getProjectByConnection(
    baseUrl: string,
    gitlabProjectId: number | string,
    gitlabToken: string,
  ): Promise<GitlabProjectSummary> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<GitlabProjectSummary>(
          `${baseUrl.replace(/\/+$/, '')}/api/v4/projects/${encodeURIComponent(String(gitlabProjectId))}`,
          {
            headers: {
              'PRIVATE-TOKEN': gitlabToken,
            },
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.throwGitlabRequestError('connexion GitLab repository', error);
    }
  }

  async listProjectBranchesByConnection(
    baseUrl: string,
    gitlabProjectId: number | string,
    gitlabToken: string,
  ): Promise<GitlabBranchItem[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<GitlabBranchItem[]>(
          `${baseUrl.replace(/\/+$/, '')}/api/v4/projects/${encodeURIComponent(String(gitlabProjectId))}/repository/branches`,
          {
            headers: {
              'PRIVATE-TOKEN': gitlabToken,
            },
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.throwGitlabRequestError(
        'vérification de la branche par défaut',
        error,
      );
    }
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
          `${baseUrl.replace(/\/+$/, '')}/api/v4/groups/${encodeURIComponent(String(gitlabGroupId))}/projects`,
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
          total: this.parseNullableHeaderInt(response.headers['x-total']),
          totalPages: this.parseNullableHeaderInt(
            response.headers['x-total-pages'],
          ),
        },
      };
    } catch (error: unknown) {
      this.throwGitlabRequestError(
        'récupération des repositories du groupe',
        error,
      );
    }
  }

  async getGroupByConnection(
    baseUrl: string,
    gitlabGroupId: number | string,
    gitlabToken: string,
  ): Promise<GitlabGroupSummary> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<GitlabGroupSummary>(
          `${baseUrl.replace(/\/+$/, '')}/api/v4/groups/${encodeURIComponent(String(gitlabGroupId))}`,
          {
            headers: {
              'PRIVATE-TOKEN': gitlabToken,
            },
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.throwGitlabRequestError('connexion GitLab group', error);
    }
  }

  private parseNullableHeaderInt(value: unknown): number | null {
    const raw: unknown = Array.isArray(value) ? value[0] : value;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  throwGitlabRequestError(action: string, error: unknown): never {
    const err = error as {
      message?: string;
      response?: { status?: number; data?: unknown };
    };

    const status = err.response?.status;
    const data = err.response?.data;

    let details = '';
    const looksLikeHtml =
      typeof data === 'string' && /<(?:!doctype|html|head|body)\b/i.test(data);

    if (typeof data === 'string') {
      details = looksLikeHtml
        ? 'Réponse HTML inattendue (URL API incorrecte ou page Cloudflare).'
        : data;
    } else if (data && typeof data === 'object') {
      const payload = data as { message?: unknown; error?: unknown };
      if (typeof payload.message === 'string') {
        details = payload.message;
      } else if (Array.isArray(payload.message)) {
        details = payload.message
          .filter((item): item is string => typeof item === 'string')
          .join(', ');
      } else if (typeof payload.error === 'string') {
        details = payload.error;
      }
    }

    const parts = [
      status ? `HTTP ${String(status)}` : null,
      details || err.message || null,
    ].filter((value): value is string => Boolean(value));

    const baseMessage =
      parts.length > 0
        ? `GitLab: ${action} échoué (${parts.join(' - ')})`
        : `GitLab: ${action} échoué`;

    const hint =
      status === 401
        ? ' — Token invalide ou manquant. Vérifiez votre Admin Token ou Personal Access Token (scopes: api ou read_api).'
        : status === 403
          ? ' — Accès refusé. Le token ne possède pas les permissions nécessaires sur ce projet/groupe.'
          : status === 404
            ? " — Projet/groupe introuvable. Vérifiez l'ID et les permissions du token."
            : '';

    const htmlHint = looksLikeHtml
      ? " — Utilisez l'URL GitLab base (ex: https://gitlab.com), l'API /api/v4 est ajoutée automatiquement."
      : '';

    throw new BadRequestException(baseMessage + hint + htmlHint);
  }
}
