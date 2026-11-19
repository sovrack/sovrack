import { NotFoundException } from '@nestjs/common';
import { GitProviderType } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import { GitProviderOauthService } from './git-provider-oauth.service';
import { GitProviderLegacySyncService } from './git-provider-legacy-sync.service';
import { GitProviderConfigService } from './git-provider-config.service';

const gitlabRow = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  teamId: 'workspace-1',
  name: 'GL',
  type: GitProviderType.GITLAB,
  providerUrl: 'https://gitlab.example.com',
  internalUrl: null,
  redirectUri: null,
  applicationId: null,
  applicationSecret: null,
  groupNames: null,
  adminToken: null,
  isDefault: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('GitProviderConfigService — GitLab CRUD', () => {
  let prisma: {
    gitProviderConfig: {
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let crypto: { encryptOptional: jest.Mock; decrypt: jest.Mock };
  let legacySync: {
    syncDefaultConfig: jest.Mock;
    syncRegistry: jest.Mock;
    bootstrapIfNeeded: jest.Mock;
  };
  let service: GitProviderConfigService;

  beforeEach(() => {
    const tx = {
      gitProviderConfig: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve(gitlabRow(data))),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve(gitlabRow(data))),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma = {
      gitProviderConfig: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue(gitlabRow()),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn().mockResolvedValue(gitlabRow()),
        findFirst: jest.fn().mockResolvedValue(gitlabRow()),
        findUnique: jest.fn().mockResolvedValue(gitlabRow()),
        findMany: jest
          .fn()
          .mockResolvedValue([gitlabRow({ adminToken: 'enc' })]),
      },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx)),
    };
    // expose tx for assertions
    (prisma as unknown as { _tx: typeof tx })._tx = tx;
    crypto = {
      encryptOptional: jest.fn((v?: string) => (v ? `enc:${v}` : null)),
      decrypt: jest.fn((v: string) => v),
    };
    legacySync = {
      syncDefaultConfig: jest.fn().mockResolvedValue(undefined),
      syncRegistry: jest.fn().mockResolvedValue(undefined),
      bootstrapIfNeeded: jest.fn().mockResolvedValue(undefined),
    };
    const tester = {
      testProvider: jest.fn(),
      listRepos: jest.fn().mockResolvedValue([
        {
          id: 1,
          name: 'my-app',
          fullName: 'org/my-app',
          httpUrl: 'https://gitlab.example.com/org/my-app.git',
          defaultBranch: 'main',
        },
      ]),
    };
    service = new GitProviderConfigService(
      prisma as unknown as PrismaService,
      crypto as unknown as CryptoService,
      {} as unknown as GitProviderOauthService,
      legacySync as unknown as GitProviderLegacySyncService,
      {} as never, // GithubProviderService (GitHub delegated; tested separately)
      tester as unknown as GitlabConnectionTesterService,
    );
    (service as unknown as { _tester: typeof tester })._tester = tester;
  });

  it('makes the FIRST GitLab provider default and encrypts its secrets', async () => {
    prisma.gitProviderConfig.count.mockResolvedValue(0);
    const res = await service.createGitlabProvider(
      {
        name: 'GL',
        providerUrl: 'https://gitlab.example.com',
        adminToken: 'tok',
      } as never,
      'workspace-1',
    );
    expect(res.isDefault).toBe(true);
    expect(crypto.encryptOptional).toHaveBeenCalledWith('tok');
    expect(legacySync.syncRegistry).toHaveBeenCalled();
    expect(legacySync.syncDefaultConfig).toHaveBeenCalled();
  });

  it('clears other defaults when a new default provider is created', async () => {
    prisma.gitProviderConfig.count.mockResolvedValue(2);
    await service.createGitlabProvider(
      {
        name: 'GL2',
        providerUrl: 'https://gl2.example.com',
        isDefault: true,
      } as never,
      'workspace-1',
    );
    const tx = (
      prisma as unknown as {
        _tx: { gitProviderConfig: { updateMany: jest.Mock } };
      }
    )._tx;
    expect(tx.gitProviderConfig.updateMany).toHaveBeenCalledWith({
      where: {
        teamId: 'workspace-1',
        type: GitProviderType.GITLAB,
        isDefault: true,
      },
      data: { isDefault: false },
    });
  });

  it('rejects creation with an empty name', async () => {
    await expect(
      service.createGitlabProvider(
        { name: '  ', providerUrl: 'x' } as never,
        'workspace-1',
      ),
    ).rejects.toThrow();
  });

  it('promotes a replacement when deleting the default provider', async () => {
    prisma.gitProviderConfig.findFirst
      .mockResolvedValueOnce(gitlabRow({ isDefault: true }))
      .mockResolvedValueOnce(gitlabRow({ id: 'g2' }));
    await service.deleteGitlabProvider('g1', 'workspace-1');
    expect(prisma.gitProviderConfig.update).toHaveBeenCalledWith({
      where: { id: 'g2' },
      data: { isDefault: true },
    });
  });

  it('setDefault clears others and resyncs', async () => {
    await service.setDefaultGitlabProvider('g1', 'workspace-1');
    const tx = (
      prisma as unknown as {
        _tx: { gitProviderConfig: { updateMany: jest.Mock } };
      }
    )._tx;
    expect(tx.gitProviderConfig.updateMany).toHaveBeenCalled();
    expect(legacySync.syncDefaultConfig).toHaveBeenCalled();
  });

  it('404s when the GitLab provider is missing or wrong type', async () => {
    prisma.gitProviderConfig.findFirst.mockResolvedValue(
      gitlabRow({ type: GitProviderType.GITHUB }),
    );
    await expect(
      service.setDefaultGitlabProvider('g1', 'workspace-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists providers via the masked public mapper (no raw token)', async () => {
    const list = await service.listGitlabProviders('workspace-1');
    expect(list[0]).not.toHaveProperty('adminToken');
    expect(list[0]).toHaveProperty('adminTokenConfigured', true);
  });

  it('listGitlabRepos fetches repos for a valid GitLab provider', async () => {
    const repos = await service.listGitlabRepos('g1', 'workspace-1');
    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe('my-app');
    expect(repos[0].fullName).toBe('org/my-app');
  });
});
