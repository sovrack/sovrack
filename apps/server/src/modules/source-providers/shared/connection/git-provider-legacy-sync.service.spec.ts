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

  it('does not read or write global legacy configuration for a workspace', async () => {
    await service.syncDefaultConfig('workspace-1');
    expect(prisma.gitProviderConfig.findFirst).not.toHaveBeenCalled();
    expect(prisma.platformConfig.deleteMany).not.toHaveBeenCalled();
    expect(prisma.platformConfig.upsert).not.toHaveBeenCalled();
  });

  it('never mirrors tenant provider secrets into global PlatformConfig', async () => {
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
    await service.syncDefaultConfig('workspace-1');

    expect(crypto.decrypt).not.toHaveBeenCalled();
    expect(crypto.encrypt).not.toHaveBeenCalled();
    expect(prisma.platformConfig.upsert).not.toHaveBeenCalled();
    expect(prisma.platformConfig.deleteMany).not.toHaveBeenCalled();
  });
});
