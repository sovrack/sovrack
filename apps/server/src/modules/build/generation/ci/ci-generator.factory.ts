import { Injectable, NotFoundException } from '@nestjs/common';
import { GitProviderType } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import type { ICiGenerator } from '../../interfaces/ci-generator.interface';
import { GitlabCiGenerator } from './gitlab-ci.generator';
import { GithubActionsGenerator } from './github-actions.generator';

function assertNever(value: never): never {
  throw new Error(
    `Unhandled GitProviderType in CiGeneratorFactory: ${String(value)}`,
  );
}

@Injectable()
export class CiGeneratorFactory {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gitlab: GitlabCiGenerator,
    private readonly github: GithubActionsGenerator,
  ) {}

  async forProject(projectId: string): Promise<ICiGenerator> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        providerRepos: {
          include: { provider: { select: { type: true } } },
          take: 1,
        },
      },
    });

    const repo = project?.providerRepos?.[0];
    if (!repo) {
      throw new NotFoundException(
        `No git config found for project ${projectId}`,
      );
    }

    return this.forProvider(repo.provider.type);
  }

  forProvider(type: GitProviderType): ICiGenerator {
    switch (type) {
      case GitProviderType.GITLAB:
        return this.gitlab;
      case GitProviderType.GITHUB:
        return this.github;
      // Gitea Actions is GitHub-Actions-compatible (same workflow YAML, reads
      // .github/workflows/), so it reuses the GitHub generator. The registry is
      // overridden per-project via options.imageRepository.
      case GitProviderType.GITEA:
        return this.github;
      default:
        return assertNever(type);
    }
  }
}
