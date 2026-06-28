import { NotFoundException } from '@nestjs/common';
import { GitProviderType } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { GitlabCiGenerator } from './gitlab-ci.generator';
import { GithubActionsGenerator } from './github-actions.generator';
import { CiGeneratorFactory } from './ci-generator.factory';

describe('CiGeneratorFactory', () => {
  const gitlab = { name: 'gitlab' } as unknown as GitlabCiGenerator;
  const github = { name: 'github' } as unknown as GithubActionsGenerator;
  let prisma: { project: { findUnique: jest.Mock } };
  let factory: CiGeneratorFactory;

  beforeEach(() => {
    prisma = { project: { findUnique: jest.fn() } };
    factory = new CiGeneratorFactory(
      prisma as unknown as PrismaService,
      gitlab,
      github,
    );
  });

  describe('forProvider', () => {
    it('returns the GitLab generator for GITLAB', () => {
      expect(factory.forProvider(GitProviderType.GITLAB)).toBe(gitlab);
    });
    it('returns the GitHub generator for GITHUB', () => {
      expect(factory.forProvider(GitProviderType.GITHUB)).toBe(github);
    });
    it('reuses the GitHub generator for GITEA (Actions-compatible)', () => {
      expect(factory.forProvider(GitProviderType.GITEA)).toBe(github);
    });
  });

  describe('forProject', () => {
    it('resolves the provider from the project repo', async () => {
      prisma.project.findUnique.mockResolvedValue({
        providerRepos: [{ provider: { type: GitProviderType.GITLAB } }],
      });
      expect(await factory.forProject('p1')).toBe(gitlab);
    });

    it('throws NotFound when the project has no git config', async () => {
      prisma.project.findUnique.mockResolvedValue({ providerRepos: [] });
      await expect(factory.forProject('p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
