import { NotFoundException } from '@nestjs/common';
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
      {} as never, // apiService
      {} as never, // registry
      ci as never, // ci
      {} as never, // fileService
      {} as never, // webhookConfigurator
      {} as never, // auth
      {} as never, // connection
      {} as never, // credential
      {} as never, // projectConfig
      {} as never, // onboarding
      {} as never, // imageRefService
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

function makeFullAdapter() {
  const apiService = {
    getBranches: jest.fn().mockResolvedValue([
      { name: 'main', default: true, commit: { id: 'sha1' } },
    ]),
    getRepos: jest.fn().mockResolvedValue([
      { id: 1, name: 'app', path_with_namespace: 'org/app', web_url: 'https://gl.io/org/app', default_branch: 'main' },
    ]),
    fetchGroupRepositories: jest.fn().mockResolvedValue([]),
    listGroupRepositoriesPageByConnection: jest.fn().mockResolvedValue({
      items: [{ path_with_namespace: 'org/repo', default_branch: 'dev', web_url: 'https://gl.io/org/repo', last_activity_at: '2026-01-01' }],
      totalCount: 1,
      nextPage: null,
    }),
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
  };

  const projectConfig = {
    getProjectConfig: jest.fn().mockResolvedValue({ id: 'prov1', sourceType: 'REGISTRY', providerUrl: 'https://gl.io' }),
    resolveRepoIdForAction: jest.fn().mockResolvedValue(123),
    assertRepoSource: jest.fn().mockReturnValue(123),
  };

  const onboarding = {
    connectProject: jest.fn().mockResolvedValue({ id: 'prov1' }),
    verifyConnectionInput: jest.fn().mockResolvedValue(undefined),
  };

  const imageRefService = {
    loadResolvedConfig: jest.fn().mockResolvedValue({
      config: { providerUrl: 'https://gl.io', defaultBranch: 'main' },
      svc: { repoPath: 'org/app', name: 'app' },
    }),
    resolveRepositoryPathFromConfig: jest.fn().mockResolvedValue('org/app'),
    resolveDockerImageRef: jest.fn().mockResolvedValue('registry.gl.io/org/app:main'),
  };

  return {
    adapter: new GitlabAdapter(
      apiService as never,
      registry as never,
      ci as never,
      fileService as never,
      webhookConfigurator as never,
      auth as never,
      connection as never,
      credential as never,
      projectConfig as never,
      onboarding as never,
      imageRefService as never,
    ),
    apiService, ci, fileService, webhookConfigurator, auth, connection, credential, registry, projectConfig,
    onboarding, imageRefService,
  };
}

describe('GitlabAdapter — connectProject / verifyConnectionInput (delegation)', () => {
  it('connectProject delegates to GitlabOnboardingService with the same arguments', async () => {
    const { adapter, onboarding } = makeFullAdapter();
    const dto = { repoPath: 'org/app' } as never;
    await adapter.connectProject('p1', dto, 'u1', Role.ADMIN);
    expect(onboarding.connectProject).toHaveBeenCalledWith('p1', dto, 'u1', Role.ADMIN);
  });

  it('verifyConnectionInput delegates to GitlabOnboardingService', async () => {
    const { adapter, onboarding } = makeFullAdapter();
    const dto = { repoPath: 'org/app', defaultBranch: 'main' } as never;
    await adapter.verifyConnectionInput(dto);
    expect(onboarding.verifyConnectionInput).toHaveBeenCalledWith(dto);
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

describe('GitlabAdapter — resolveDockerImageRef (delegation)', () => {
  it('delegates to GitlabImageRefService with the same arguments', async () => {
    const { adapter, imageRefService } = makeFullAdapter();
    const result = await adapter.resolveDockerImageRef('p1', 'main', 'svc1');
    expect(imageRefService.resolveDockerImageRef).toHaveBeenCalledWith('p1', 'main', 'svc1');
    expect(result).toBe('registry.gl.io/org/app:main');
  });
});

describe('GitlabAdapter — resolveRepositoryPathFromConfig (delegation)', () => {
  it('delegates to GitlabImageRefService with the same arguments', async () => {
    const { adapter, imageRefService } = makeFullAdapter();
    const config = { providerUrl: 'https://gl.io' } as never;
    await adapter.resolveRepositoryPathFromConfig(config, 'fallback-slug', 7);
    expect(imageRefService.resolveRepositoryPathFromConfig).toHaveBeenCalledWith(
      config,
      'fallback-slug',
      7,
    );
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

  it('resolveRegistryCredentials calls imageRefService.loadResolvedConfig then credential service', async () => {
    const { adapter, imageRefService, credential } = makeFullAdapter();
    await adapter.resolveRegistryCredentials('p1');
    expect(imageRefService.loadResolvedConfig).toHaveBeenCalledWith('p1');
    expect(credential.resolveRegistryCredentialsFromConfig).toHaveBeenCalled();
  });

  it('resolveRegistryCredentials propagates NotFoundException when no provider found', async () => {
    const { adapter, imageRefService } = makeFullAdapter();
    imageRefService.loadResolvedConfig.mockRejectedValueOnce(
      new NotFoundException('Aucune config GitLab pour le projet p1'),
    );
    await expect(adapter.resolveRegistryCredentials('p1')).rejects.toThrow(NotFoundException);
  });

  it('resolveRepositoryPath calls imageRefService.loadResolvedConfig then resolveRepositoryPathFromConfig', async () => {
    const { adapter, imageRefService } = makeFullAdapter();
    await adapter.resolveRepositoryPath('p1', 7);
    expect(imageRefService.loadResolvedConfig).toHaveBeenCalledWith('p1');
    expect(imageRefService.resolveRepositoryPathFromConfig).toHaveBeenCalledWith(
      expect.objectContaining({ providerUrl: 'https://gl.io' }),
      'main',
      7,
    );
  });
});
