import { Injectable, NotFoundException } from '@nestjs/common';
import { GitProviderType } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import type { ICiGenerator } from '../../interfaces/ci-generator.interface';
import { GitlabCiGenerator } from './gitlab-ci.generator';
import { GithubActionsGenerator } from './github-actions.generator';

function assertNever(value: never): never {
  throw new Error(`Unhandled GitProviderType in CiGeneratorFactory: ${String(value)}`);
}

/**
 * Resolves the correct CI config generator for a project or a provider type.
 *
 * Usage:
 *   const generator = await factory.forProject(projectId);
 *   const content   = generator.generate({ projectType, branches });
 *   const filePath  = generator.getFilePath();  // .gitlab-ci.yml or .github/workflows/build.yml
 */
@Injectable()
export class CiGeneratorFactory {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gitlab: GitlabCiGenerator,
    private readonly github: GithubActionsGenerator,
  ) {}

  /**
   * Resolve the generator for a project by looking up its GitProviderConfig.
   * Falls back to GitLab if no provider is configured (legacy projects).
   */
  async forProject(projectId: string): Promise<ICiGenerator> {
    const config = await this.prisma.appProviderLink.findUnique({
      where: { projectId },
      include: { provider: { select: { type: true } } },
    });

    if (!config) {
      throw new NotFoundException(`No git config found for project ${projectId}`);
    }

    const providerType: GitProviderType = config.provider?.type ?? GitProviderType.GITLAB;
    return this.forProvider(providerType);
  }

  /**
   * Resolve the generator by explicit provider type.
   * TypeScript exhaustiveness check ensures new providers are handled.
   */
  forProvider(type: GitProviderType): ICiGenerator {
    switch (type) {
      case GitProviderType.GITLAB:
        return this.gitlab;
      case GitProviderType.GITHUB:
        return this.github;
      default:
        return assertNever(type);
    }
  }
}
