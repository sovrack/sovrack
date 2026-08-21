import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GitProviderType } from '@prisma/client';
import { of, throwError } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import { GithubProviderService } from './github-provider.service';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'h1',
  teamId: 'workspace-1',
  name: 'GH',
  type: GitProviderType.GITHUB,
  providerUrl: 'https://github.com',
  internalUrl: null,
  redirectUri: null,
  applicationId: null,
  applicationSecret: null,
  groupNames: null,
  adminToken: null,
  oauthAccessToken: null,
  isDefault: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('GithubProviderService', () => {
  let prisma: {
    gitProviderConfig: {
      count: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let http: { get: jest.Mock };
  let crypto: { encryptOptional: jest.Mock; decrypt: jest.Mock };
  let txCfg: { create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  let service: GithubProviderService;

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
        findFirst: jest.fn().mockResolvedValue(row({ adminToken: 'enc-pat' })),
        findUnique: jest.fn().mockResolvedValue(row({ adminToken: 'enc-pat' })),
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
    http = { get: jest.fn() };
    crypto = {
      encryptOptional: jest.fn((v?: string) => (v ? `enc:${v}` : null)),
      decrypt: jest.fn((v: string) => v.replace(/^enc-?/, '')),
    };
    service = new GithubProviderService(
      prisma as unknown as PrismaService,
      http as unknown as HttpService,
      crypto as unknown as CryptoService,
    );
  });

  it('makes the first GitHub provider default and encrypts its token', async () => {
    prisma.gitProviderConfig.count.mockResolvedValue(0);
    const res = await service.create(
      {
        name: 'GH',
        providerUrl: 'https://github.com',
        adminToken: 'tok',
      },
      'workspace-1',
    );
    expect(res.isDefault).toBe(true);
    expect(crypto.encryptOptional).toHaveBeenCalledWith('tok');
  });

  it('404s for a missing or wrong-type provider', async () => {
    prisma.gitProviderConfig.findFirst.mockResolvedValue(
      row({ type: GitProviderType.GITLAB }),
    );
    await expect(
      service.setDefault('h1', 'workspace-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists providers masked (no raw token)', async () => {
    const list = await service.list('workspace-1');
    expect(list[0]).not.toHaveProperty('adminToken');
  });

  it('test() rejects when no token is configured', async () => {
    prisma.gitProviderConfig.findFirst.mockResolvedValue(
      row({ adminToken: null, oauthAccessToken: null }),
    );
    await expect(service.test('h1', 'workspace-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('test() returns ok when GitHub /user responds', async () => {
    http.get.mockReturnValue(of({ data: { login: 'me' } }));
    const res = await service.test('h1', 'workspace-1');
    expect(res.ok).toBe(true);
  });

  it('test() throws when all tokens fail', async () => {
    http.get.mockReturnValue(throwError(() => new Error('401')));
    await expect(service.test('h1', 'workspace-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('listRepos() paginates and maps repo fields', async () => {
    http.get
      .mockReturnValueOnce(
        of({
          data: [
            {
              id: 1,
              name: 'r',
              full_name: 'me/r',
              clone_url: 'https://github.com/me/r.git',
              default_branch: 'main',
            },
          ],
        }),
      )
      .mockReturnValueOnce(of({ data: [] }));
    const repos = await service.listRepos('h1', 'workspace-1');
    expect(repos[0]).toEqual({
      id: 1,
      name: 'r',
      fullName: 'me/r',
      httpUrl: 'https://github.com/me/r.git',
      defaultBranch: 'main',
    });
  });
});
