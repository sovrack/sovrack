import { Role } from '@prisma/client';
import { GitlabAdapter } from './gitlab.adapter';

/**
 * GitlabAdapter maps the raw GitLab API shapes (which vary between snake_case
 * and camelCase depending on the source) to the platform's RepoItem/BranchItem.
 * We stub the resolution methods and assert the mapping is correct.
 */
describe('GitlabAdapter (response mapping)', () => {
  let ci: { getPipelines: jest.Mock };
  let adapter: GitlabAdapter;

  beforeEach(() => {
    ci = { getPipelines: jest.fn() };
    adapter = new GitlabAdapter(
      {} as never, // prisma
      {} as never, // apiService
      {} as never, // crypto
      {} as never, // registry
      ci as never, // ci
      {} as never, // fileService
      {} as never, // webhookConfigurator
      {} as never, // auth
      {} as never, // connection
      {} as never, // credential
      {} as never, // projectConfig
    );
  });

  it('listRepos maps snake_case fields (path_with_namespace, web_url, default_branch)', async () => {
    jest.spyOn(adapter, 'getRepos').mockResolvedValue([
      {
        id: '5',
        name: 'app',
        path_with_namespace: 'org/app',
        web_url: 'https://gitlab.com/org/app',
        default_branch: 'develop',
        description: 'x',
      },
    ] as never);
    const [repo] = await adapter.listRepos('p1', 'u1', Role.ADMIN);
    expect(repo).toEqual({
      id: 5,
      name: 'app',
      fullName: 'org/app',
      httpUrl: 'https://gitlab.com/org/app',
      defaultBranch: 'develop',
      description: 'x',
    });
  });

  it('listBranches maps name/default/commit.id', async () => {
    jest.spyOn(adapter, 'getBranches').mockResolvedValue([
      { name: 'main', default: true, commit: { id: 'sha1' } },
      { name: 'dev', default: false, commit: { id: 'sha2' } },
    ] as never);
    const branches = await adapter.listBranches('p1', 'u1', Role.ADMIN);
    expect(branches).toEqual([
      { name: 'main', isDefault: true, commitSha: 'sha1' },
      { name: 'dev', isDefault: false, commitSha: 'sha2' },
    ]);
  });

  it('listPipelines delegates to the CI service and maps id/status', async () => {
    ci.getPipelines.mockResolvedValue([{ id: 9, status: 'success' }]);
    const [p] = await adapter.listPipelines('p1', 'u1', Role.ADMIN);
    expect(p).toMatchObject({ id: 9, status: 'success' });
  });
});
