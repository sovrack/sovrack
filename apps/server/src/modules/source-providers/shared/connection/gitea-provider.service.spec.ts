import { NotFoundException } from '@nestjs/common';
import { GitProviderType } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import { GiteaProviderService } from './gitea-provider.service';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  name: 'Gitea',
  type: GitProviderType.GITEA,
  providerUrl: 'https://gitea.example.com',
  internalUrl: null,
  adminToken: null,
  isDefault: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('GiteaProviderService', () => {
  let prisma: {
    gitProviderConfig: {
      count: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let crypto: { encryptOptional: jest.Mock };
  let txCfg: { create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  let service: GiteaProviderService;

  beforeEach(() => {
    txCfg = {
      create: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve(row(data))),
      update: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve(row(data))),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    prisma = {
      gitProviderConfig: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(row()),
        findMany: jest.fn().mockResolvedValue([row({ adminToken: 'enc' })]),
        delete: jest.fn().mockResolvedValue(row()),
      },
      $transaction: jest
        .fn()
        .mockImplementation(
          (cb: (t: { gitProviderConfig: typeof txCfg }) => unknown) =>
            cb({ gitProviderConfig: txCfg }),
        ),
    };
    crypto = {
      encryptOptional: jest.fn((v?: string) => (v ? `enc:${v}` : null)),
    };
    service = new GiteaProviderService(
      prisma as unknown as PrismaService,
      crypto as unknown as CryptoService,
    );
  });

  it('makes the first Gitea provider default and encrypts its token', async () => {
    prisma.gitProviderConfig.count.mockResolvedValue(0);
    const res = await service.create({
      name: 'Gitea',
      providerUrl: 'https://gitea.example.com',
      adminToken: 'tok',
    });
    expect(res.isDefault).toBe(true);
    expect(crypto.encryptOptional).toHaveBeenCalledWith('tok');
  });

  it('clears other defaults when creating a new default', async () => {
    prisma.gitProviderConfig.count.mockResolvedValue(2);
    await service.create({
      name: 'G2',
      providerUrl: 'https://g2',
      isDefault: true,
    });
    expect(txCfg.updateMany).toHaveBeenCalledWith({
      where: { type: GitProviderType.GITEA, isDefault: true },
      data: { isDefault: false },
    });
  });

  it('rejects an empty name', async () => {
    await expect(
      service.create({ name: '  ', providerUrl: 'x' }),
    ).rejects.toThrow();
  });

  it('404s for a missing or wrong-type provider on setDefault', async () => {
    prisma.gitProviderConfig.findUnique.mockResolvedValue(
      row({ type: GitProviderType.GITHUB }),
    );
    await expect(service.setDefault('g1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists providers masked (no raw token)', async () => {
    const list = await service.list();
    expect(list[0]).not.toHaveProperty('adminToken');
    expect(list[0]).toHaveProperty('adminTokenConfigured', true);
  });
});
