import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role, SourceType } from '@prisma/client';
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

// ─── Additional coverage ─────────────────────────────────────────────────────

function makeFullAdapter(opts: {
  apiMocks?: Record<string, jest.Mock>;
  projectFound?: boolean;
  gitProviderConfigFound?: boolean;
  branches?: { name: string; default: boolean; commit: { id: string } }[];
  groupRepos?: { path_with_namespace: string; default_branch: string }[];
} = {}) {
  const prisma = {
    project: {
      findUnique: jest.fn().mockResolvedValue(opts.projectFound !== false ? { name: 'my-proj' } : null),
    },
    service: {
      findFirst: jest.fn().mockResolvedValue(
        opts.projectFound !== false ? { providerId: 'prov1', sourceType: SourceType.GIT, branch: 'main', repoPath: 'org/app', name: 'app' } : null,
      ),
      findUnique: jest.fn().mockResolvedValue({ name: 'app' }),
    },
    gitProviderConfig: {
      findUnique: jest.fn().mockResolvedValue(
        opts.gitProviderConfigFound !== false
          ? { id: 'prov1', providerUrl: 'https://gitlab.example.com', adminToken: 'enc-tok', oauthAccessToken: null }
          : null,
      ),
    },
    serviceEnvironment: { findFirst: jest.fn().mockResolvedValue(null) },
    environment: { findFirst: jest.fn().mockResolvedValue({ id: 'env1' }) },
  };

  const apiService = {
    getProjectByConnection: jest.fn().mockResolvedValue({ path_with_namespace: 'org/app' }),
    listProjectBranchesByConnection: jest.fn().mockResolvedValue(
      opts.branches ?? [{ name: 'main', default: true, commit: { id: 'sha1' } }],
    ),
    getGroupByConnection: jest.fn().mockResolvedValue({}),
    listGroupRepositoriesByConnection: jest.fn().mockResolvedValue(
      opts.groupRepos ?? [{ path_with_namespace: 'org/repo', default_branch: 'main' }],
    ),
    listGroupRepositoriesPageByConnection: jest.fn().mockResolvedValue({
      items: [{ path_with_namespace: 'org/repo', default_branch: 'dev', web_url: 'https://gl.io/org/repo', last_activity_at: '2026-01-01' }],
      totalCount: 1,
      nextPage: null,
    }),
    getBranches: jest.fn().mockResolvedValue(
      opts.branches ?? [{ name: 'main', default: true, commit: { id: 'sha1' } }],
    ),
    getRepos: jest.fn().mockResolvedValue([{ id: 1, name: 'app', path_with_namespace: 'org/app', web_url: 'https://gl.io/org/app', default_branch: 'main' }]),
    fetchGroupRepositories: jest.fn().mockResolvedValue([]),
    resolveRepositoryPath: jest.fn().mockResolvedValue('registry.gl.io/org/app'),
    ...opts.apiMocks,
  };

  const cryptoService = {
    encrypt: jest.fn().mockImplementation((v: string) => `enc-${v}`),
    decrypt: jest.fn().mockImplementation((v: string) => `dec-${v}`),
  };

  const registry = { listGitlabProvidersForProjects: jest.fn().mockResolvedValue([]) };

  const ci = {
    getPipelines: jest.fn().mockResolvedValue([{ id: 10, status: 'running', ref: 'main', sha: 'abc', web_url: 'https://ci.gl.io/10' }]),
    getPipelinesForService: jest.fn().mockResolvedValue([]),
    triggerPipeline: jest.fn().mockResolvedValue({ id: 42, status: 'created', ref: 'main', sha: 'xyz', web_url: 'https://ci.gl.io/42' }),
  };

  const fileService = {
    readFile: jest.fn().mockResolvedValue('content'),
    writeFiles: jest.fn().mockResolvedValue({ success: true }),
    resolveGitCredentials: jest.fn().mockResolvedValue({ username: 'user', password: 'tok' }),
  };

  const webhookConfigurator = {
    configureWebhook: jest.fn().mockResolvedValue({ hookId: 5, url: 'https://hook' }),
  };

  const auth = {
    assertCanManageProject: jest.fn().mockResolvedValue(undefined),
    assertCanAccessProject: jest.fn().mockResolvedValue(undefined),
  };

  const connection = {
    resolveGitlabConnectionInput: jest.fn().mockResolvedValue({
      gitlabUrl: 'https://gitlab.example.com',
      gitlabToken: 'tok',
      providerId: null,
    }),
    normalizeUrl: jest.fn().mockImplementation((u: string) => u.replace(/\/+$/, '')),
    normalizeRepositoryPath: jest.fn().mockImplementation((p: string) => p),
    toPublicConfig: jest.fn().mockReturnValue({ id: 'prov1', gitlabUrl: 'https://gitlab.example.com' }),
  };

  const credential = {
    resolveRegistryCredentialsFromConfig: jest.fn().mockReturnValue({ username: 'user', password: 'tok' }),
    resolveRegistryHost: jest.fn().mockReturnValue('registry.gl.io'),
    isPlaceholderPath: jest.fn().mockReturnValue(false),
    extractPathFromUrl: jest.fn().mockReturnValue(null),
  };

  const projectConfig = {
    getProjectConfig: jest.fn().mockResolvedValue({ id: 'prov1', sourceType: SourceType.REGISTRY, providerUrl: 'https://gl.io' }),
    resolveRepoIdForAction: jest.fn().mockResolvedValue(123),
    assertRepoSource: jest.fn().mockReturnValue(123),
  };

  return {
    adapter: new GitlabAdapter(
      prisma as never,
      apiService as never,
      cryptoService as never,
      registry as never,
      ci as never,
      fileService as never,
      webhookConfigurator as never,
      auth as never,
      connection as never,
      credential as never,
      projectConfig as never,
    ),
    prisma, apiService, ci, fileService, webhookConfigurator, auth, connection, credential, registry, projectConfig,
  };
}

describe('GitlabAdapter — verifyConnectionInput', () => {
  it('throws when branch is not found in repo', async () => {
    const { adapter } = makeFullAdapter({ branches: [{ name: 'dev', default: true, commit: { id: 'sha' } }] });
    await expect(adapter.verifyConnectionInput({ repoPath: 'org/app', defaultBranch: 'nonexistent' } as never))
      .rejects.toThrow(BadRequestException);
  });

  it('succeeds when branch exists', async () => {
    const { adapter } = makeFullAdapter();
    await expect(adapter.verifyConnectionInput({ repoPath: 'org/app', defaultBranch: 'main' } as never))
      .resolves.not.toThrow();
  });

  it('throws when group has no repositories', async () => {
    const { adapter } = makeFullAdapter({ groupRepos: [] });
    await expect(adapter.verifyConnectionInput({ groupPath: 'my-group' } as never))
      .rejects.toThrow(BadRequestException);
  });

  it('succeeds for group with repositories', async () => {
    const { adapter } = makeFullAdapter();
    await expect(adapter.verifyConnectionInput({ groupPath: 'my-group' } as never))
      .resolves.not.toThrow();
  });
});

describe('GitlabAdapter — triggerPipeline', () => {
  it('maps web_url to webUrl in the returned PipelineItem', async () => {
    const { adapter } = makeFullAdapter();
    const result = await adapter.triggerPipeline('p1', 'main', 'u1', Role.ADMIN);
    expect(result.webUrl).toBe('https://ci.gl.io/42');
    expect(result.id).toBe(42);
  });
});

describe('GitlabAdapter — listGroupRepositoriesByProvider', () => {
  it('maps snake_case fields (path_with_namespace → pathWithNamespace)', async () => {
    const { adapter } = makeFullAdapter();
    const result = await adapter.listGroupRepositoriesByProvider({
      groupId: 'my-group',
    });
    expect(result.items[0].pathWithNamespace).toBe('org/repo');
    expect(result.items[0].defaultBranch).toBe('dev');
  });
});

describe('GitlabAdapter — resolveDockerImageRef', () => {
  it('falls back to slug:tag when no provider config exists', async () => {
    const { adapter } = makeFullAdapter({ projectFound: false });
    const result = await adapter.resolveDockerImageRef('p1', 'main');
    expect(result).toContain(':main');
  });

  it('builds full registry image ref when config exists', async () => {
    const { adapter } = makeFullAdapter();
    const result = await adapter.resolveDockerImageRef('p1', 'main');
    expect(result).toContain('registry.gl.io/');
    expect(result).toContain(':main');
  });
});

describe('GitlabAdapter — delegation methods', () => {
  it('listAvailableProviders delegates to registry', async () => {
    const { adapter, registry } = makeFullAdapter();
    await adapter.listAvailableProviders();
    expect(registry.listGitlabProvidersForProjects).toHaveBeenCalled();
  });

  it('getGitlabConfig delegates to projectConfig + connection.toPublicConfig', async () => {
    const { adapter, connection } = makeFullAdapter();
    const result = await adapter.getGitlabConfig('p1', 'u1', Role.ADMIN);
    expect(connection.toPublicConfig).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('readFile delegates to fileService', async () => {
    const { adapter, fileService } = makeFullAdapter();
    const result = await adapter.readFile('p1', 'Dockerfile');
    expect(fileService.readFile).toHaveBeenCalledWith('p1', 'Dockerfile', undefined);
    expect(result).toBe('content');
  });

  it('configureWebhook delegates to webhookConfigurator', async () => {
    const { adapter, webhookConfigurator } = makeFullAdapter();
    await adapter.configureWebhook('p1', 'https://hook', 'secret');
    expect(webhookConfigurator.configureWebhook).toHaveBeenCalled();
  });

  it('resolveRegistryCredentials calls loadResolvedConfig then credential service', async () => {
    const { adapter, credential } = makeFullAdapter();
    await adapter.resolveRegistryCredentials('p1');
    expect(credential.resolveRegistryCredentialsFromConfig).toHaveBeenCalled();
  });

  it('resolveRegistryCredentials throws NotFoundException when no provider found', async () => {
    const { adapter } = makeFullAdapter({ projectFound: false });
    await expect(adapter.resolveRegistryCredentials('p1')).rejects.toThrow(NotFoundException);
  });
});
