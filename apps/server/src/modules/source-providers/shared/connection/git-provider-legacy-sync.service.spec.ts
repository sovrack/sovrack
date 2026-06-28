import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import { GitProviderLegacySyncService } from './git-provider-legacy-sync.service';

describe('GitProviderLegacySyncService.syncDefaultConfig', () => {
  let prisma: {
    gitProviderConfig: { findFirst: jest.Mock };
    platformConfig: { deleteMany: jest.Mock; upsert: jest.Mock };
  };
  let crypto: { encrypt: jest.Mock; decrypt: jest.Mock };
  let service: GitProviderLegacySyncService;

  beforeEach(() => {
    prisma = {
      gitProviderConfig: { findFirst: jest.fn().mockResolvedValue(null) },
      platformConfig: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    crypto = {
      encrypt: jest.fn((v: string) => `enc:${v}`),
      decrypt: jest.fn((v: string) => `dec:${v}`),
    };
    service = new GitProviderLegacySyncService(
      prisma as unknown as PrismaService,
      {} as unknown as HttpService,
      crypto as unknown as CryptoService,
    );
  });

  it('clears all legacy GitLab keys when there is no default provider', async () => {
    prisma.gitProviderConfig.findFirst.mockResolvedValue(null);
    await service.syncDefaultConfig();
    expect(prisma.platformConfig.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: { in: expect.any(Array) } } }),
    );
    expect(prisma.platformConfig.upsert).not.toHaveBeenCalled();
  });

  it('upserts populated config and encrypts secrets (token decrypted then re-encrypted)', async () => {
    prisma.gitProviderConfig.findFirst.mockResolvedValue({
      name: 'GL',
      providerUrl: 'https://gl.example.com',
      internalUrl: null,
      redirectUri: null,
      applicationId: null,
      applicationSecret: null,
      groupNames: null,
      adminToken: 'enc-stored',
      oauthAccessToken: null,
      oauthRefreshToken: null,
      oauthExpiresAt: null,
    });
    await service.syncDefaultConfig();

    // Non-secret URL upserted as-is.
    expect(prisma.platformConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'GITLAB_URL' },
        create: expect.objectContaining({
          value: 'https://gl.example.com',
          isSecret: false,
        }),
      }),
    );
    // Token: decrypt(stored) → re-encrypt for legacy config.
    expect(crypto.decrypt).toHaveBeenCalledWith('enc-stored');
    expect(prisma.platformConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'GITLAB_TOKEN' },
        create: expect.objectContaining({
          value: 'enc:dec:enc-stored',
          isSecret: true,
        }),
      }),
    );
    // Empty fields are cleared, not upserted.
    expect(prisma.platformConfig.deleteMany).toHaveBeenCalledWith({
      where: { key: 'GITLAB_INTERNAL_URL' },
    });
  });
});
