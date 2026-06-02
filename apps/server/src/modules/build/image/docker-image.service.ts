import { Injectable } from '@nestjs/common';
import { GitlabConfig, GitlabSourceType } from '@prisma/client';
import { GitlabService } from '../../git-providers/gitlab/gitlab.service';

@Injectable()
export class DockerImageService {
  constructor(private readonly gitlabService: GitlabService) {}

  async buildDockerImage({
    gitlabConfig,
    projectName,
    projectGitlabUrl,
    branch,
    repositoryId,
  }: {
    gitlabConfig?: GitlabConfig | null;
    projectName: string;
    projectGitlabUrl?: string | null;
    branch: string;
    repositoryId?: number;
  }): Promise<string> {
    const projectSlug = this.sanitizeDockerTag(projectName);

    if (!gitlabConfig) {
      return `${projectSlug}:${this.sanitizeDockerTag(branch)}`;
    }

    const registryHost = this.resolveRegistryHost(
      gitlabConfig.registryUrl,
      gitlabConfig.gitlabUrl,
    );
    const resolvedPath = await this.gitlabService.resolveRepositoryPath(
      gitlabConfig,
      projectSlug,
      repositoryId,
    );
    const fallbackPathFromUrl =
      this.extractRepositoryPathFromProjectUrl(projectGitlabUrl);
    const repositoryPath =
      fallbackPathFromUrl &&
      this.isPlaceholderRepositoryPath(gitlabConfig, resolvedPath)
        ? fallbackPathFromUrl
        : resolvedPath;
    const tag = this.sanitizeDockerTag(branch);

    return `${registryHost}/${repositoryPath}:${tag}`;
  }

  sanitizeDockerTag(value: string): string {
    const sanitized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return sanitized || 'latest';
  }

  resolveRegistryHost(
    registryUrl: string | null | undefined,
    gitlabUrl: string,
  ): string {
    if (registryUrl && registryUrl.trim()) {
      return this.cleanRegistryHost(registryUrl);
    }

    try {
      const parsed = new URL(gitlabUrl);
      if (parsed.hostname.toLowerCase() === 'gitlab.com') {
        return 'registry.gitlab.com';
      }
      if (parsed.port) {
        return parsed.host;
      }
      return `${parsed.hostname}:5050`;
    } catch {
      const fallback = this.cleanRegistryHost(gitlabUrl);
      return fallback.includes(':') ? fallback : `${fallback}:5050`;
    }
  }

  cleanRegistryHost(value: string): string {
    return value
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '');
  }

  extractRepositoryPathFromProjectUrl(
    projectGitlabUrl?: string | null,
  ): string | null {
    if (!projectGitlabUrl?.trim()) {
      return null;
    }

    try {
      const parsed = new URL(projectGitlabUrl);
      const path = parsed.pathname
        .replace(/^\/+/, '')
        .replace(/\/+$/, '')
        .replace(/\.git$/i, '');

      return path || null;
    } catch {
      const cleaned = projectGitlabUrl
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/^[^/]+\/?/, '')
        .replace(/\/+$/, '')
        .replace(/\.git$/i, '');

      return cleaned || null;
    }
  }

  isPlaceholderRepositoryPath(
    config: GitlabConfig,
    repositoryPath: string,
  ): boolean {
    if (
      config.sourceType === GitlabSourceType.REPO &&
      config.gitlabId &&
      repositoryPath.startsWith(`project-${String(config.gitlabId)}/`)
    ) {
      return true;
    }

    return Boolean(
      config.sourceType === GitlabSourceType.GROUP &&
      config.gitlabGroupId &&
      repositoryPath.startsWith(`group-${String(config.gitlabGroupId)}/`),
    );
  }
}
