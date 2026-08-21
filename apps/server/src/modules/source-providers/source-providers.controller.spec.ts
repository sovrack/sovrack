import type { Request } from 'express';
import { GitProviderConfigService } from './shared/connection/git-provider-config.service';
import { GitProviderOauthService } from './shared/connection/git-provider-oauth.service';
import { SourceProvidersController } from './source-providers.controller';

describe('SourceProvidersController', () => {
  const workspaceId = 'workspace-1';

  function build() {
    const gitProviders = {
      listGitlabProviders: jest.fn().mockResolvedValue([]),
      createGitlabProvider: jest.fn().mockResolvedValue({ id: 'g1' }),
      updateGitlabProvider: jest.fn().mockResolvedValue({ id: 'g1' }),
      deleteGitlabProvider: jest.fn().mockResolvedValue(undefined),
      setDefaultGitlabProvider: jest.fn().mockResolvedValue({ id: 'g1' }),
      testGitlab: jest.fn().mockResolvedValue({ ok: true }),
      listGithubProviders: jest.fn().mockResolvedValue([]),
      createGithubProvider: jest.fn().mockResolvedValue({ id: 'h1' }),
      updateGithubProvider: jest.fn().mockResolvedValue({ id: 'h1' }),
      deleteGithubProvider: jest.fn().mockResolvedValue(undefined),
      setDefaultGithubProvider: jest.fn().mockResolvedValue({ id: 'h1' }),
      testGithubProvider: jest.fn().mockResolvedValue({ ok: true }),
      listGithubRepos: jest.fn().mockResolvedValue([]),
    } as unknown as GitProviderConfigService;
    const oauth = {
      startGitlabOAuthForProvider: jest.fn().mockResolvedValue({ url: 'u' }),
      startGitlabOAuth: jest.fn().mockResolvedValue({ url: 'u' }),
    } as unknown as GitProviderOauthService;
    const ctrl = new SourceProvidersController(gitProviders, oauth);
    return { ctrl, gitProviders, oauth };
  }

  const req = {
    header: jest.fn().mockReturnValue(undefined),
    protocol: 'https',
    get: jest.fn().mockReturnValue('example.com'),
  } as unknown as Request;

  it('GitLab provider CRUD + default/test delegate', async () => {
    const { ctrl, gitProviders } = build();
    await ctrl.listGitlabProviders(workspaceId);
    await ctrl.createGitlabProvider(
      { name: 'n', providerUrl: 'u' } as never,
      workspaceId,
    );
    await ctrl.updateGitlabProvider('g1', { name: 'm' } as never, workspaceId);
    expect(await ctrl.deleteGitlabProvider('g1', workspaceId)).toEqual({
      ok: true,
    });
    await ctrl.setDefaultGitlabProvider('g1', workspaceId);
    await ctrl.testGitlabProvider('g1', workspaceId);
    await ctrl.testGitlab(workspaceId);
    expect(gitProviders.listGitlabProviders).toHaveBeenCalledWith(workspaceId);
    expect(gitProviders.createGitlabProvider).toHaveBeenCalledWith(
      { name: 'n', providerUrl: 'u' },
      workspaceId,
    );
    expect(gitProviders.updateGitlabProvider).toHaveBeenCalledWith(
      'g1',
      {
        name: 'm',
      },
      workspaceId,
    );
    expect(gitProviders.deleteGitlabProvider).toHaveBeenCalledWith(
      'g1',
      workspaceId,
    );
    expect(gitProviders.setDefaultGitlabProvider).toHaveBeenCalledWith(
      'g1',
      workspaceId,
    );
    expect(gitProviders.testGitlab).toHaveBeenCalledWith(workspaceId, 'g1');
    expect(gitProviders.testGitlab).toHaveBeenCalledWith(workspaceId);
  });

  it('GitLab OAuth endpoints resolve the public base url and delegate', async () => {
    const { ctrl, oauth } = build();
    await ctrl.startGitlabOAuthForProvider('g1', req, workspaceId);
    await ctrl.startGitlabOAuth(req, workspaceId);
    expect(oauth.startGitlabOAuthForProvider).toHaveBeenCalledWith(
      'g1',
      workspaceId,
      'https://example.com',
    );
    expect(oauth.startGitlabOAuth).toHaveBeenCalledWith(
      workspaceId,
      'https://example.com',
    );
  });

  it('GitHub provider CRUD + repos delegate', async () => {
    const { ctrl, gitProviders } = build();
    await ctrl.listGithubProviders(workspaceId);
    await ctrl.createGithubProvider(
      { name: 'n', providerUrl: 'u' } as never,
      workspaceId,
    );
    await ctrl.updateGithubProvider('h1', { name: 'm' } as never, workspaceId);
    expect(await ctrl.deleteGithubProvider('h1', workspaceId)).toEqual({
      ok: true,
    });
    await ctrl.setDefaultGithubProvider('h1', workspaceId);
    await ctrl.testGithubProvider('h1', workspaceId);
    await ctrl.listGithubRepos('h1', workspaceId);
    expect(gitProviders.listGithubRepos).toHaveBeenCalledWith(
      'h1',
      workspaceId,
    );
    expect(gitProviders.testGithubProvider).toHaveBeenCalledWith(
      'h1',
      workspaceId,
    );
  });

  it('resolvePublicBaseUrl honours x-forwarded headers when present', async () => {
    const { ctrl, oauth } = build();
    const fwdReq = {
      header: jest.fn((h: string) =>
        h === 'x-forwarded-proto'
          ? 'https'
          : h === 'x-forwarded-host'
            ? 'proxy.example.com'
            : undefined,
      ),
      protocol: 'http',
      get: jest.fn(),
    } as unknown as Request;
    await ctrl.startGitlabOAuth(fwdReq, workspaceId);
    expect(oauth.startGitlabOAuth).toHaveBeenCalledWith(
      workspaceId,
      'https://proxy.example.com',
    );
  });
});
