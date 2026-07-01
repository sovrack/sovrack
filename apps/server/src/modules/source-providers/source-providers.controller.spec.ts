import type { Request } from 'express';
import { GitProviderConfigService } from './shared/connection/git-provider-config.service';
import { GitProviderOauthService } from './shared/connection/git-provider-oauth.service';
import { SourceProvidersController } from './source-providers.controller';

describe('SourceProvidersController', () => {
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
    await ctrl.listGitlabProviders();
    await ctrl.createGitlabProvider({ name: 'n', providerUrl: 'u' } as never);
    await ctrl.updateGitlabProvider('g1', { name: 'm' } as never);
    expect(await ctrl.deleteGitlabProvider('g1')).toEqual({ ok: true });
    await ctrl.setDefaultGitlabProvider('g1');
    await ctrl.testGitlabProvider('g1');
    await ctrl.testGitlab();
    expect(gitProviders.listGitlabProviders).toHaveBeenCalled();
    expect(gitProviders.createGitlabProvider).toHaveBeenCalled();
    expect(gitProviders.updateGitlabProvider).toHaveBeenCalledWith('g1', {
      name: 'm',
    });
    expect(gitProviders.deleteGitlabProvider).toHaveBeenCalledWith('g1');
    expect(gitProviders.setDefaultGitlabProvider).toHaveBeenCalledWith('g1');
    expect(gitProviders.testGitlab).toHaveBeenCalledTimes(2);
  });

  it('GitLab OAuth endpoints resolve the public base url and delegate', async () => {
    const { ctrl, oauth } = build();
    await ctrl.startGitlabOAuthForProvider('g1', req);
    await ctrl.startGitlabOAuth(req);
    expect(oauth.startGitlabOAuthForProvider).toHaveBeenCalledWith(
      'g1',
      'https://example.com',
    );
    expect(oauth.startGitlabOAuth).toHaveBeenCalledWith('https://example.com');
  });

  it('GitHub provider CRUD + repos delegate', async () => {
    const { ctrl, gitProviders } = build();
    await ctrl.listGithubProviders();
    await ctrl.createGithubProvider({ name: 'n', providerUrl: 'u' } as never);
    await ctrl.updateGithubProvider('h1', { name: 'm' } as never);
    expect(await ctrl.deleteGithubProvider('h1')).toEqual({ ok: true });
    await ctrl.setDefaultGithubProvider('h1');
    await ctrl.testGithubProvider('h1');
    await ctrl.listGithubRepos('h1');
    expect(gitProviders.listGithubRepos).toHaveBeenCalledWith('h1');
    expect(gitProviders.testGithubProvider).toHaveBeenCalledWith('h1');
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
    await ctrl.startGitlabOAuth(fwdReq);
    expect(oauth.startGitlabOAuth).toHaveBeenCalledWith(
      'https://proxy.example.com',
    );
  });
});
