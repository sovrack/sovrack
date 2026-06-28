import { Injectable, Logger } from '@nestjs/common';
import { SourceProvidersService } from '../../source-providers/source-providers.service';
import { sanitizeDockerTag } from '../../../shared/utils/docker-tag.util';

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

  constructor(private readonly gitProvidersService: SourceProvidersService) {}

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
      // Invariant : le provider est lié au SERVICE. On résout par service
      // quand on l'a (correct en multi-provider), sinon fallback projet.
      const provider = serviceId
        ? await this.gitProvidersService.forService(serviceId)
        : await this.gitProvidersService.forProject(projectId);
      return await provider.resolveDockerImageRef(projectId, branch, serviceId);
    } catch (err: unknown) {
      this.logger.warn(
        `[BuildImageService] Provider resolution failed for project ${projectId}, ` +
          `falling back to local slug. Reason: ${err instanceof Error ? err.message : String(err)}`,
      );
      return `${sanitizeDockerTag(projectName)}:${sanitizeDockerTag(branch)}`;
    }
  }
}
