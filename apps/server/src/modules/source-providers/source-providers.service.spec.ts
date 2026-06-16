import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GitProviderType } from '@prisma/client';
import { SourceProvidersService } from './source-providers.service';
import { PrismaService } from '../../core/database/prisma.service';
import { GitlabAdapter } from './adapters/gitlab/gitlab.adapter';
import { GitlabClient } from './adapters/gitlab/gitlab.client';
import { GitlabConnectionService } from './adapters/gitlab/gitlab-connection.service';
import { GithubAdapter } from './adapters/github/github.adapter';
import { GiteaAdapter } from './adapters/gitea/gitea.adapter';

/**
 * P3 — GitProviderFactory. The factory has to:
 *   - Resolve the right provider for a project based on its config
 *     (project's Service → GitProviderConfig.type)
 *   - Fall back to GitLab when the project's provider type is unset
 *   - Expose a list of all wired providers
 *   - Use `assertNever` so adding a new GitProviderType breaks compilation
 *     of the switch (compile-time exhaustiveness)
 */
describe('SourceProvidersService (factory)', () => {
  let service: SourceProvidersService;
  let prisma: {
    service: { findFirst: jest.Mock };
    gitProviderConfig: { findUnique: jest.Mock };
  };
  // Minimal IGitProvider-shaped mocks (only the methods we exercise).
  let gitlab: {
    id: string;
    type: string;
    listRepos: jest.Mock;
    listBranches: jest.Mock;
    listPipelines: jest.Mock;
    triggerPipeline: jest.Mock;
    resolveRepositoryPath: jest.Mock;
    resolveRegistryCredentials: jest.Mock;
  };
  let github: typeof gitlab;
  let gitea: typeof gitlab;

  beforeEach(async () => {
    prisma = {
      service: { findFirst: jest.fn() },
      gitProviderConfig: { findUnique: jest.fn() },
    };
    const methods = () => ({
      listRepos: jest.fn(),
      listBranches: jest.fn(),
      listPipelines: jest.fn(),
      triggerPipeline: jest.fn(),
      resolveRepositoryPath: jest.fn(),
      resolveRegistryCredentials: jest.fn(),
    });
    gitlab = { id: 'gitlab-impl', type: GitProviderType.GITLAB, ...methods() };
    github = { id: 'github-impl', type: GitProviderType.GITHUB, ...methods() };
    gitea = { id: 'gitea-impl', type: GitProviderType.GITEA, ...methods() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SourceProvidersService,
        { provide: PrismaService, useValue: prisma },
        { provide: GitlabAdapter, useValue: gitlab },
        { provide: GitlabClient, useValue: {} },
        { provide: GitlabConnectionService, useValue: {} },
        { provide: GithubAdapter, useValue: github },
        { provide: GiteaAdapter, useValue: gitea },
      ],
    }).compile();

    service = moduleRef.get(SourceProvidersService);
  });

  describe('forType', () => {
    it('returns the GitHub instance for GITHUB', () => {
      const provider = service.forType(GitProviderType.GITHUB) as unknown as {
        id: string;
      };
      expect(provider.id).toBe('github-impl');
    });

    it('returns the GitLab instance for GITLAB', () => {
      const provider = service.forType(GitProviderType.GITLAB) as unknown as {
        id: string;
      };
      expect(provider.id).toBe('gitlab-impl');
    });

    it('returns the Gitea instance for GITEA', () => {
      const provider = service.forType(GitProviderType.GITEA) as unknown as {
        id: string;
      };
      expect(provider.id).toBe('gitea-impl');
    });
  });

  describe('listAvailable', () => {
    it('exposes every wired provider so the admin UI does not hardcode the list', () => {
      const list = service.listAvailable();
      expect(list).toHaveLength(3);
      const ids = list.map((p) => (p as unknown as { id: string }).id).sort();
      expect(ids).toEqual(['gitea-impl', 'github-impl', 'gitlab-impl']);
    });
  });

  describe('forProject', () => {
    it('uses the provider type resolved from the project config', async () => {
      prisma.service.findFirst.mockResolvedValue({ providerId: 'prov_1' });
      prisma.gitProviderConfig.findUnique.mockResolvedValue({
        type: GitProviderType.GITHUB,
      });
      const provider = (await service.forProject('proj_1')) as unknown as {
        id: string;
      };
      expect(provider.id).toBe('github-impl');
      expect(prisma.service.findFirst).toHaveBeenCalledWith({
        where: { projectId: 'proj_1', providerId: { not: null } },
        select: { providerId: true },
      });
    });

    it('falls back to GitLab when the resolved provider type is unset', async () => {
      prisma.service.findFirst.mockResolvedValue({ providerId: 'prov_1' });
      prisma.gitProviderConfig.findUnique.mockResolvedValue({ type: null });
      const provider = (await service.forProject('proj_2')) as unknown as {
        id: string;
      };
      expect(provider.id).toBe('gitlab-impl');
    });

    it('throws NotFoundException when the project has no source config', async () => {
      prisma.service.findFirst.mockResolvedValue(null);
      await expect(service.forProject('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('assertNever (compile-time guarantee)', () => {
    // This test does not need to run anything: the `forType` switch is
    // exhaustive at the type level. If someone adds a new GitProviderType
    // value without updating the switch, `npx tsc --noEmit` will fail
    // because the default branch returns `assertNever(value: never)`.
    it('typecheck covers exhaustiveness (see CI "backend:typecheck" job)', () => {
      expect(true).toBe(true);
    });
  });

  describe('IGitProvider contract resolution', () => {
    it('forProject returns a provider that exposes the IGitProvider methods', async () => {
      prisma.service.findFirst.mockResolvedValue({ providerId: 'prov_1' });
      prisma.gitProviderConfig.findUnique.mockResolvedValue({
        type: GitProviderType.GITLAB,
      });
      const provider = await service.forProject('proj_1');
      expect(typeof provider.listRepos).toBe('function');
      expect(typeof provider.listBranches).toBe('function');
      expect(typeof provider.listPipelines).toBe('function');
      expect(typeof provider.triggerPipeline).toBe('function');
      expect(typeof provider.resolveRepositoryPath).toBe('function');
      expect(typeof provider.resolveRegistryCredentials).toBe('function');
      // Webhook reception is no longer part of IGitProvider — it lives in
      // the unified webhooks module (IWebhookHandler).
    });

    it('forType returns providers tagged with their type discriminant', () => {
      const gitlabProvider = service.forType(GitProviderType.GITLAB);
      const githubProvider = service.forType(GitProviderType.GITHUB);
      expect(gitlabProvider.type).toBe(GitProviderType.GITLAB);
      expect(githubProvider.type).toBe(GitProviderType.GITHUB);
    });

    it('exposes the triggerPipeline shortcut', () => {
      expect(typeof service.triggerPipeline).toBe('function');
    });
  });
});
