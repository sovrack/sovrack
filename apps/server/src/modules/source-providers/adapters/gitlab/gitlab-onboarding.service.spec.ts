import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { GitlabOnboardingService } from './gitlab-onboarding.service';

// Extracted from GitlabAdapter — see EXPLORATION_BACKEND_DEPENDANCES.md
// section 4. connectProject/verifyConnectionInput behaviour ported unchanged.
function harness(
  opts: {
    branches?: { name: string; default: boolean; commit: { id: string } }[];
    groupRepos?: { path_with_namespace: string; default_branch: string }[];
    existingService?: unknown;
  } = {},
) {
  const prisma = {
    gitProviderConfig: {
      create: jest.fn().mockResolvedValue({ id: 'prov-new' }),
    },
    environment: {
      findFirst: jest.fn().mockResolvedValue({ id: 'env1' }),
      create: jest.fn().mockResolvedValue({ id: 'env1' }),
    },
    service: {
      findFirst: jest.fn().mockResolvedValue(opts.existingService ?? null),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({ id: 'svc-new' }),
    },
    serviceEnvironment: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    gitProviderRepo: {
      upsert: jest.fn().mockResolvedValue({}),
    },
  };

  const apiService = {
    getProjectByConnection: jest
      .fn()
      .mockResolvedValue({ path_with_namespace: 'org/app' }),
    getGroupByConnection: jest.fn().mockResolvedValue({}),
    fetchGroupRepositories: jest.fn().mockResolvedValue(opts.groupRepos ?? []),
    listProjectBranchesByConnection: jest
      .fn()
      .mockResolvedValue(
        opts.branches ?? [
          { name: 'main', default: true, commit: { id: 'sha1' } },
        ],
      ),
    listGroupRepositoriesByConnection: jest
      .fn()
      .mockResolvedValue(
        opts.groupRepos ?? [
          { path_with_namespace: 'org/repo', default_branch: 'main' },
        ],
      ),
  };

  const cryptoService = {
    encrypt: jest.fn().mockImplementation((v: string) => `enc-${v}`),
  };

  const auth = {
    assertCanManageProject: jest.fn().mockResolvedValue(undefined),
  };

  const connection = {
    resolveGitlabConnectionInput: jest.fn().mockResolvedValue({
      gitlabUrl: 'https://gitlab.example.com',
      gitlabToken: 'tok',
      providerId: null,
    }),
    normalizeUrl: jest
      .fn()
      .mockImplementation((u: string) => u.replace(/\/+$/, '')),
    normalizeRepositoryPath: jest.fn().mockImplementation((p: string) => p),
    toPublicConfig: jest.fn().mockReturnValue({
      id: 'prov-new',
      gitlabUrl: 'https://gitlab.example.com',
    }),
  };

  const service = new GitlabOnboardingService(
    prisma as never,
    apiService as never,
    cryptoService as never,
    auth as never,
    connection as never,
  );

  return { service, prisma, apiService, cryptoService, auth, connection };
}

describe('GitlabOnboardingService.connectProject', () => {
  it('checks manage authorization before doing anything else', async () => {
    const { service, auth } = harness();
    await service.connectProject(
      'p1',
      { repoPath: 'org/app' } as never,
      'u1',
      Role.ADMIN,
    );
    expect(auth.assertCanManageProject).toHaveBeenCalledWith(
      'p1',
      'u1',
      Role.ADMIN,
    );
  });

  it('creates a new service + serviceEnvironment link + GitProviderRepo when connecting a single repo', async () => {
    const { service, prisma } = harness();
    await service.connectProject(
      'p1',
      { repoPath: 'org/app' } as never,
      'u1',
      Role.ADMIN,
    );
    expect(prisma.service.create).toHaveBeenCalled();
    expect(prisma.serviceEnvironment.create).toHaveBeenCalled();
  });

  it('updates the existing service instead of creating a new one when one already exists', async () => {
    const { service, prisma } = harness({
      existingService: { id: 'svc-existing' },
    });
    await service.connectProject(
      'p1',
      { repoPath: 'org/app' } as never,
      'u1',
      Role.ADMIN,
    );
    expect(prisma.service.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'svc-existing' } }),
    );
    expect(prisma.service.create).not.toHaveBeenCalled();
  });

  it('auto-syncs group repositories as GitProviderRepo entries when connecting a group', async () => {
    const { service, prisma } = harness({
      groupRepos: [
        { path_with_namespace: 'org/repo-a', default_branch: 'main' },
      ],
    });
    await service.connectProject(
      'p1',
      { groupPath: 'my-group' } as never,
      'u1',
      Role.ADMIN,
    );
    expect(prisma.gitProviderRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ repoPath: 'org/repo-a' }),
      }),
    );
  });
});

describe('GitlabOnboardingService.verifyConnectionInput', () => {
  it('throws when branch is not found in repo', async () => {
    const { service } = harness({
      branches: [{ name: 'dev', default: true, commit: { id: 'sha' } }],
    });
    await expect(
      service.verifyConnectionInput({
        repoPath: 'org/app',
        defaultBranch: 'nonexistent',
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('succeeds when branch exists', async () => {
    const { service } = harness();
    await expect(
      service.verifyConnectionInput({
        repoPath: 'org/app',
        defaultBranch: 'main',
      } as never),
    ).resolves.not.toThrow();
  });

  it('throws when group has no repositories', async () => {
    const { service } = harness({ groupRepos: [] });
    await expect(
      service.verifyConnectionInput({ groupPath: 'my-group' } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('succeeds for group with repositories', async () => {
    const { service } = harness();
    await expect(
      service.verifyConnectionInput({ groupPath: 'my-group' } as never),
    ).resolves.not.toThrow();
  });
});
