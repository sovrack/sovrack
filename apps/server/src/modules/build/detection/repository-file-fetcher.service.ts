import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { GitProviderType } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import type { RepoTreeItem, GitHubTreeItem } from './build-detection.types';

/**
 * Récupère l'arborescence et le contenu brut des fichiers d'un dépôt via l'API
 * du provider Git (GitLab / GitHub). Isole l'I/O réseau de l'analyse de
 * signaux, qui reste dans BuildDetectorService.
 */
@Injectable()
export class RepositoryFileFetcherService {
  private readonly logger = new Logger(RepositoryFileFetcherService.name);

  constructor(private readonly httpService: HttpService) {}

  async listGitLabRepositoryFiles(
    baseUrl: string,
    gitlabId: string,
    token: string,
  ): Promise<string[]> {
    const all: string[] = [];
    let page = 1;
    const perPage = 100;
    const MAX_PAGES = 200;

    while (page <= MAX_PAGES) {
      const response = await firstValueFrom(
        this.httpService.get<RepoTreeItem[]>(
          `${baseUrl}/api/v4/projects/${encodeURIComponent(String(gitlabId))}/repository/tree`,
          {
            headers: { 'PRIVATE-TOKEN': token },
            params: { recursive: true, per_page: perPage, page },
          },
        ),
      );

      const items = Array.isArray(response.data) ? response.data : [];
      if (items.length === 0) {
        break;
      }

      for (const item of items) {
        const path = item.path || item.name;
        if (path) {
          all.push(path);
        }
      }

      const headers = response.headers as Record<string, unknown>;
      const nextHeader = headers['x-next-page'];
      const nextPageHeader =
        typeof nextHeader === 'string'
          ? nextHeader
          : Array.isArray(nextHeader) && typeof nextHeader[0] === 'string'
            ? nextHeader[0]
            : '';
      const nextPage = Number(nextPageHeader);
      if (!Number.isFinite(nextPage) || nextPage <= page) {
        break;
      }
      page = nextPage;
    }

    return Array.from(new Set(all));
  }

  async listGitHubRepositoryFiles(
    baseUrl: string,
    repoFullName: string | null,
    token: string,
    ref: string,
  ): Promise<string[]> {
    if (!repoFullName) {
      throw new NotFoundException('Nom de dépôt GitHub introuvable');
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const commitRes = await firstValueFrom(
      this.httpService.get<{ sha: string }>(
        `${baseUrl}/repos/${repoFullName}/commits/${encodeURIComponent(ref)}`,
        { headers },
      ),
    );
    const commitSha = commitRes.data.sha;

    const treeRes = await firstValueFrom(
      this.httpService.get<{ tree: GitHubTreeItem[]; truncated: boolean }>(
        `${baseUrl}/repos/${repoFullName}/git/trees/${commitSha}?recursive=1`,
        { headers },
      ),
    );

    const items = Array.isArray(treeRes.data.tree) ? treeRes.data.tree : [];

    return items
      .filter((item) => item.type === 'blob')
      .map((item) => item.path);
  }

  async fetchRawFile(
    baseUrl: string,
    provider: GitProviderType,
    repoId: string,
    token: string,
    filePath: string,
    ref: string,
  ): Promise<string | null> {
    try {
      if (provider === GitProviderType.GITHUB) {
        if (!repoId) return null;
        const res = await firstValueFrom(
          this.httpService.get<{ content?: string; encoding?: string }>(
            `${baseUrl}/repos/${repoId}/contents/${encodeURIComponent(filePath)}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
              },
              params: { ref },
            },
          ),
        );
        const { content, encoding } = res.data;
        if (!content) return null;
        if (encoding === 'base64')
          return Buffer.from(content.replace(/\n/g, ''), 'base64').toString(
            'utf-8',
          );
        return content;
      } else {
        const res = await firstValueFrom(
          this.httpService.get<string>(
            `${baseUrl}/api/v4/projects/${encodeURIComponent(repoId)}/repository/files/${encodeURIComponent(filePath)}/raw`,
            {
              headers: { 'PRIVATE-TOKEN': token },
              params: { ref },
              responseType: 'text',
            },
          ),
        );
        return typeof res.data === 'string' ? res.data : null;
      }
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status && status !== 404) {
        this.logger.warn(
          `fetchRawFile error (status=${status}): ${this.errorMessage(error)}`,
        );
      }
      return null;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
