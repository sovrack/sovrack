import { Injectable, Logger } from '@nestjs/common';
import { GitProvidersService } from '../../git-providers/git-providers.service';

/**
 * Resolves the Docker image reference for a project.
 *
 * Delegates to the provider-specific implementation via IGitProvider.resolveDockerImageRef().
 * GitLab  → {registry_host}/{repo_path}:{sanitized_branch}
 * GitHub  → ghcr.io/{owner}/{repo}:{sanitized_branch} (or custom registry)
 *
 * Falls back to a plain `{slug}:{tag}` when no Git config is found.
 */
@Injectable()
export class BuildImageService {
  private readonly logger = new Logger(BuildImageService.name);

  constructor(private readonly gitProvidersService: GitProvidersService) {}

  async buildDockerImage({
    projectId,
    projectName,
    branch,
    serviceId,
  }: {
    projectId: string;
    projectName: string;
    branch: string;
    serviceId?: string;
  }): Promise<string> {
    try {
      const provider = await this.gitProvidersService.forProject(projectId);
      return await provider.resolveDockerImageRef(projectId, branch, serviceId);
    } catch (err: unknown) {
      this.logger.warn(
        `[BuildImageService] Provider resolution failed for project ${projectId}, ` +
          `falling back to local slug. Reason: ${err instanceof Error ? err.message : String(err)}`,
      );
      return `${this.sanitizeDockerTag(projectName)}:${this.sanitizeDockerTag(branch)}`;
    }
  }

  sanitizeDockerTag(value: string): string {
    const sanitized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return sanitized || 'latest';
  }
}
