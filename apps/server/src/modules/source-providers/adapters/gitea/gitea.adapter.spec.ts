import { NotFoundException } from '@nestjs/common';
import { GitProviderType, Role } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import { GitProviderConfigService } from '../../shared/connection/git-provider-config.service';
import { GiteaAdapter } from './gitea.adapter';
import { GiteaClient } from './gitea.client';

describe('GiteaAdapter', () => {
  const PROVIDER = {
    id: 'prov-1',
    type: GitProviderType.GITEA,
    providerUrl: 'https://git.platform.io',
    name: 'platform-gitea',
    oauthAccessToken: 'enc-token',
    adminToken: null,
  };
  const SERVICE = {
    providerId: 'prov-1',
    repoPath: 'https://git.platform.io/acme/api.git',
    branch: 'main',
  };

  function build(opts: { service?: unknown; provider?: unknown } = {}) {
    const prisma = {
      service: {
        findFirst: jest.fn().mockResolvedValue(opts.service ?? SERVICE),
      },
      gitProviderConfig: {
        findUnique: jest.fn().mockResolvedValue(opts.provider ?? PROVIDER),
      },
    } as unknown as PrismaService;
    const config = {
      decryptProviderToken: jest.fn().mockReturnValue('decrypted-pat'),
    } as unknown as GitProviderConfigService;
    const api = {
      buildApiBase: jest.fn((u: string) => `${u}/api/v1`),
      listRepos: jest
        .fn()
        .mockResolvedValue([{ id: 1, name: 'api', fullName: 'acme/api' }]),
      listActionRuns: jest.fn().mockResolvedValue([]),
      triggerWorkflow: jest.fn().mockResolvedValue({
        id: 9,
        status: 'queued',
        ref: 'main',
        sha: '',
        webUrl: '',
      }),
    } as unknown as GiteaClient;
    return { adapter: new GiteaAdapter(prisma, config, api), api };
  }

  it('exposes the GITEA discriminant', () => {
    expect(build().adapter.type).toBe(GitProviderType.GITEA);
  });

  it('resolves the connection and delegates listRepos to the client', async () => {
    const { adapter, api } = build();
    const repos = await adapter.listRepos('p1', 'u1', Role.ADMIN);
    expect(repos).toHaveLength(1);
    expect(api.buildApiBase).toHaveBeenCalledWith('https://git.platform.io');
    expect(api.listRepos).toHaveBeenCalledWith(
      'https://git.platform.io/api/v1',
      'decrypted-pat',
    );
  });

  it('builds a registry-qualified docker image ref', async () => {
    const ref = await build().adapter.resolveDockerImageRef(
      'p1',
      'feature/Login',
    );
    expect(ref).toBe('git.platform.io/acme/api:feature-login');
  });

  it('returns git credentials with an https clone url + token', async () => {
    const creds = await build().adapter.resolveGitCredentials('p1');
    expect(creds).toEqual({
      repoUrl: 'https://git.platform.io/acme/api.git',
      token: 'decrypted-pat',
    });
  });

  it('throws when the project has no linked Gitea provider', async () => {
    const { adapter } = build({ service: { providerId: null } });
    await expect(
      adapter.listRepos('p1', 'u1', Role.ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a provider config of the wrong type', async () => {
    const { adapter } = build({
      provider: { ...PROVIDER, type: GitProviderType.GITHUB },
    });
    await expect(
      adapter.listRepos('p1', 'u1', Role.ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
