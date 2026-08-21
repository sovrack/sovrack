import { GitProviderType, Role } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { GithubAdapter } from './github.adapter';

/**
 * GithubAdapter is orchestration over the (separately-tested) GithubClient: it
 * resolves the project's credentials from the DB, then delegates to the client.
 * We stub the private credential resolver and assert the delegation wiring.
 */
describe('GithubAdapter (delegation)', () => {
  let api: { listRepos: jest.Mock; listBranches: jest.Mock };
  let adapter: GithubAdapter;

  const creds = {
    token: 'tok',
    apiBase: 'https://api.github.com',
    fullRepoName: 'org/app',
    defaultBranch: 'main',
  };

  beforeEach(() => {
    api = {
      listRepos: jest.fn().mockResolvedValue([{ id: 1 }]),
      listBranches: jest.fn().mockResolvedValue([{ name: 'main' }]),
    };
    adapter = new GithubAdapter(
      {} as never,
      {} as never,
      api as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(
        adapter as unknown as { resolveProjectCredentials: jest.Mock },
        'resolveProjectCredentials',
      )
      .mockResolvedValue(creds);
  });

  it('listRepos delegates to the client with the resolved apiBase/token', async () => {
    const res = await adapter.listRepos('p1', 'u1', Role.OWNER);
    expect(res).toEqual([{ id: 1 }]);
    expect(api.listRepos).toHaveBeenCalledWith(creds.apiBase, creds.token);
  });

  it('listBranches forwards the repo name + default branch', async () => {
    await adapter.listBranches('p1', 'u1', Role.OWNER, 'r1');
    expect(api.listBranches).toHaveBeenCalledWith(
      creds.apiBase,
      creds.token,
      creds.fullRepoName,
      creds.defaultBranch,
    );
  });

  it('resolveRepositoryPath returns the resolved fullRepoName', async () => {
    expect(await adapter.resolveRepositoryPath('p1')).toBe('org/app');
  });

  it('rejects a provider owned by another workspace during connection', async () => {
    const prisma = {
      project: {
        findUnique: jest.fn().mockResolvedValue({ teamId: 'workspace-1' }),
      },
      gitProviderConfig: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const scopedAdapter = new GithubAdapter(
      prisma as never,
      {} as never,
      api as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      scopedAdapter.connectProject('project-1', {
        gitlabToken: 'token',
        repoPath: 'org/app',
        defaultBranch: 'main',
        providerId: 'foreign-provider',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.gitProviderConfig.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'foreign-provider',
        teamId: 'workspace-1',
        type: GitProviderType.GITHUB,
      },
      select: { id: true },
    });
  });
});
