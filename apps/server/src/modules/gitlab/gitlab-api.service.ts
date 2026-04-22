import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import { GitlabConfig, GitlabSourceType } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { GitlabCryptoService } from './gitlab-crypto.service';

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
  web_url?: string;
  namespace?: {
    full_path?: string;
    path?: string;
  };
};

type GitlabProjectSummary = {
  path_with_namespace?: string;
  path?: string;
  namespace?: {
    full_path?: string;
  };
};

type GitlabGroupSummary = {
  full_path?: string;
  path?: string;
};

@Injectable()
export class GitlabApiService {
  constructor(
    private readonly httpService: HttpService,
    private readonly crypto: GitlabCryptoService,
  ) {}

  async getBranches(
    config: GitlabConfig,
    repoId: number,
    normalizeUrl: (url: string) => string,
  ): Promise<GitlabBranchItem[]> {
    const gitlabToken = this.crypto.decryptConfigToken(config.gitlabToken);

    try {
      const response = await firstValueFrom(
        this.httpService.get<GitlabBranchItem[]>(
          `${normalizeUrl(config.gitlabUrl)}/api/v4/projects/${encodeURIComponent(String(repoId))}/repository/branches`,
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
    config: GitlabConfig,
    repoId: number,
    normalizeUrl: (url: string) => string,
  ): Promise<GitlabPipelineItem[]> {
    const gitlabToken = this.crypto.decryptConfigToken(config.gitlabToken);

    try {
      const response = await firstValueFrom(
        this.httpService.get<GitlabPipelineItem[]>(
          `${normalizeUrl(config.gitlabUrl)}/api/v4/projects/${encodeURIComponent(String(repoId))}/pipelines`,
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
    config: GitlabConfig,
    repoId: number,
    branch: string,
    normalizeUrl: (url: string) => string,
  ): Promise<GitlabPipelineItem> {
    const gitlabToken = this.crypto.decryptConfigToken(config.gitlabToken);

    try {
      const response = await firstValueFrom(
        this.httpService.post<GitlabPipelineItem>(
          `${normalizeUrl(config.gitlabUrl)}/api/v4/projects/${encodeURIComponent(String(repoId))}/pipeline`,
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
    config: GitlabConfig,
    repoId: number,
    normalizeUrl: (url: string) => string,
  ): Promise<GitlabRepoItem[]> {
    const gitlabToken = this.crypto.decryptConfigToken(config.gitlabToken);
    try {
      const response = await firstValueFrom(
        this.httpService.get<GitlabRepoItem>(
          `${normalizeUrl(config.gitlabUrl)}/api/v4/projects/${encodeURIComponent(String(repoId))}`,
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
    config: GitlabConfig,
    normalizeUrl: (url: string) => string,
  ): Promise<GitlabRepoItem[]> {
    if (!config.gitlabGroupId) {
      throw new BadRequestException('Aucun gitlabGroupId configuré');
    }

    const gitlabToken = this.crypto.decryptConfigToken(config.gitlabToken);

    try {
      const response = await firstValueFrom(
        this.httpService.get<GitlabRepoItem[]>(
          `${normalizeUrl(config.gitlabUrl)}/api/v4/groups/${encodeURIComponent(String(config.gitlabGroupId))}/projects`,
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
    config: GitlabConfig;
    fallbackProjectSlug: string;
    preferredRepoId?: number;
    normalizeRepositoryPath: (value: string) => string;
    normalizeUrl: (value: string) => string;
    resolveRepoIdForAction: (
      config: GitlabConfig,
      action: string,
      preferredRepoId?: number,
    ) => Promise<number>;
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

    if (config.sourceType === GitlabSourceType.REPO && config.gitlabId) {
      const gitlabToken = this.crypto.decryptConfigToken(config.gitlabToken);

      try {
        const response = await firstValueFrom(
          this.httpService.get<GitlabProjectSummary>(
            `${normalizeUrl(config.gitlabUrl)}/api/v4/projects/${encodeURIComponent(String(config.gitlabId))}`,
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

      return `project-${String(config.gitlabId)}/${normalizedFallback}`;
    }

    if (config.sourceType === GitlabSourceType.GROUP && config.gitlabGroupId) {
      const gitlabToken = this.crypto.decryptConfigToken(config.gitlabToken);
      const targetRepoId = await resolveRepoIdForAction(
        config,
        "résolution du repository pour l'image Docker",
        preferredRepoId,
      );

      try {
        const response = await firstValueFrom(
          this.httpService.get<GitlabProjectSummary>(
            `${normalizeUrl(config.gitlabUrl)}/api/v4/projects/${encodeURIComponent(String(targetRepoId))}`,
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
            `${normalizeUrl(config.gitlabUrl)}/api/v4/groups/${encodeURIComponent(String(config.gitlabGroupId))}`,
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

      return `group-${String(config.gitlabGroupId)}/${normalizedFallback}`;
    }

    return normalizedFallback;
  }

  async validateGitlabRepoConnection(
    baseUrl: string,
    gitlabId: number,
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
    gitlabGroupId: number,
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

  throwGitlabRequestError(action: string, error: unknown): never {
    const err = error as {
      message?: string;
      response?: { status?: number; data?: unknown };
    };

    const status = err.response?.status;
    const data = err.response?.data;

    let details = '';
    if (typeof data === 'string') {
      details = data;
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

    throw new BadRequestException(
      parts.length > 0
        ? `GitLab: ${action} échoué (${parts.join(' - ')})`
        : `GitLab: ${action} échoué`,
    );
  }
}
