import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DnsProviderType } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import { DomainsService } from './domains.service';

describe('DomainsService', () => {
  let prisma: {
    dnsProvider: {
      findMany: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
    };
    project: { findFirst: jest.Mock; findUnique: jest.Mock };
    serviceEnvironment: { findFirst: jest.Mock; findUnique: jest.Mock };
    domain: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    dnsRecord: { create: jest.Mock };
  };
  let crypto: { encrypt: jest.Mock };
  let service: DomainsService;

  beforeEach(() => {
    prisma = {
      dnsProvider: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'dp1', ...data }),
          ),
        findFirst: jest.fn().mockResolvedValue({ id: 'dp1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'dp1' }),
      },
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'p1' }),
      },
      serviceEnvironment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'se1',
          service: { projectId: 'p1' },
        }),
        findUnique: jest.fn().mockResolvedValue({ id: 'se1' }),
      },
      domain: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'd1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'd1' }),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'd1', ...data }),
          ),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'd1', ...data }),
          ),
        delete: jest.fn().mockResolvedValue({}),
      },
      dnsRecord: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'rec1', ...data }),
          ),
      },
    };
    crypto = { encrypt: jest.fn((v: string) => `enc:${v}`) };
    service = new DomainsService(
      prisma as unknown as PrismaService,
      crypto as unknown as CryptoService,
    );
  });

  it('encrypts the DNS provider API token on create', async () => {
    await service.createProvider(
      {
        name: 'cf',
        type: DnsProviderType.CLOUDFLARE,
        apiToken: 'secret',
      } as never,
      'workspace-1',
    );
    expect(crypto.encrypt).toHaveBeenCalledWith('secret');
  });

  it('masks the API token in the public provider shape', async () => {
    prisma.dnsProvider.findMany.mockResolvedValue([
      { id: 'dp1', name: 'cf', type: 'CLOUDFLARE', apiToken: 'enc:x' },
    ]);
    const list = await service.listProviders('workspace-1');
    expect(list[0].apiToken).toBe('***');
    expect(list[0].apiTokenConfigured).toBe(true);
  });

  it('reports MANUAL providers as ready without a token', async () => {
    prisma.dnsProvider.findFirst.mockResolvedValue({
      id: 'dp1',
      type: DnsProviderType.MANUAL,
      apiToken: null,
    });
    const res = await service.testProvider('dp1', 'workspace-1');
    expect(res.ok).toBe(true);
    expect(res.status).toBe('MANUAL');
  });

  it('rejects testing a non-MANUAL provider without a token', async () => {
    prisma.dnsProvider.findFirst.mockResolvedValue({
      id: 'dp1',
      type: DnsProviderType.CLOUDFLARE,
      apiToken: null,
    });
    await expect(
      service.testProvider('dp1', 'workspace-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lowercases the domain name and validates provider + project on create', async () => {
    const created = await service.createDomain(
      {
        name: 'API.Example.COM',
        providerId: 'dp1',
        projectId: 'p1',
      } as never,
      'workspace-1',
    );
    expect(created.name).toBe('api.example.com');
    expect(prisma.dnsProvider.findFirst).toHaveBeenCalled();
    expect(prisma.project.findFirst).toHaveBeenCalled();
  });

  it('rejects creating a domain with an unknown provider', async () => {
    prisma.dnsProvider.findFirst.mockResolvedValue(null);
    await expect(
      service.createDomain(
        { name: 'x.com', providerId: 'nope' } as never,
        'workspace-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks a domain verified only when it has records', async () => {
    prisma.domain.findFirst.mockResolvedValue({
      id: 'd1',
      records: [{ id: 'r' }],
    });
    await service.verifyDomain('d1', 'workspace-1');
    expect(prisma.domain.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { verified: true } }),
    );
  });

  it('404s when removing a missing domain', async () => {
    prisma.domain.findFirst.mockResolvedValue(null);
    await expect(
      service.removeDomain('nope', 'workspace-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
