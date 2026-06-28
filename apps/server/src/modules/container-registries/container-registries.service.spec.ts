import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RegistryProviderType } from '@prisma/client';
import { of } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../shared/database/prisma.service';
import { CryptoService } from '../../shared/crypto/crypto.service';
import { ContainerRegistriesService } from './container-registries.service';
import { RegistryConnectionTesterService } from './registry-connection-tester.service';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  name: 'hub',
  type: RegistryProviderType.DOCKER_HUB,
  username: 'me',
  password: 'enc:secret',
  registryUrl: null,
  isDefault: false,
  isConnected: false,
  connectionError: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
  ...over,
});

describe('ContainerRegistriesService', () => {
  let prisma: {
    registryConfig: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let http: { post: jest.Mock; get: jest.Mock };
  let crypto: {
    encryptOptional: jest.Mock;
    decrypt: jest.Mock;
  };
  let service: ContainerRegistriesService;

  beforeEach(() => {
    prisma = {
      registryConfig: {
        findMany: jest.fn().mockResolvedValue([row()]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(row()),
        count: jest.fn().mockResolvedValue(0),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve(row(data))),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve(row(data))),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn().mockResolvedValue(row()),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    http = { post: jest.fn(), get: jest.fn() };
    crypto = {
      encryptOptional: jest.fn((v?: string) => (v ? `enc:${v}` : null)),
      decrypt: jest.fn((v: string) => v.replace(/^enc:/, '')),
    };
    const connectionTester = new RegistryConnectionTesterService(
      prisma as unknown as PrismaService,
      http as unknown as HttpService,
      crypto as unknown as CryptoService,
    );
    service = new ContainerRegistriesService(
      prisma as unknown as PrismaService,
      crypto as unknown as CryptoService,
      connectionTester,
    );
  });

  it('lists registries mapped to the public shape (no password leak)', async () => {
    const list = await service.listRegistryConfigs();
    expect(list[0]).not.toHaveProperty('password');
    expect(list[0].name).toBe('hub');
  });

  it('makes the FIRST registry of a type default automatically', async () => {
    prisma.registryConfig.count.mockResolvedValue(0);
    const created = await service.createRegistryConfig({
      name: 'first',
      type: RegistryProviderType.DOCKER_HUB,
      password: 'pw',
    });
    expect(created.isDefault).toBe(true);
    expect(crypto.encryptOptional).toHaveBeenCalledWith('pw');
  });

  it('clears other defaults when a new default is requested', async () => {
    prisma.registryConfig.count.mockResolvedValue(2);
    await service.createRegistryConfig({
      name: 'x',
      type: RegistryProviderType.DOCKER_HUB,
      isDefault: true,
    });
    expect(prisma.registryConfig.updateMany).toHaveBeenCalledWith({
      where: { type: RegistryProviderType.DOCKER_HUB, isDefault: true },
      data: { isDefault: false },
    });
  });

  it('rejects an empty name', async () => {
    await expect(
      service.createRegistryConfig({
        name: '   ',
        type: RegistryProviderType.DOCKER_HUB,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('promotes a replacement default when deleting the default registry', async () => {
    prisma.registryConfig.findUnique.mockResolvedValue(
      row({ isDefault: true }),
    );
    prisma.registryConfig.findFirst.mockResolvedValue(row({ id: 'r2' }));
    await service.deleteRegistryConfig('r1');
    expect(prisma.registryConfig.update).toHaveBeenCalledWith({
      where: { id: 'r2' },
      data: { isDefault: true },
    });
  });

  it('404s for an unknown registry', async () => {
    prisma.registryConfig.findUnique.mockResolvedValue(null);
    await expect(
      service.setDefaultRegistryConfig('nope'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks DOCKER_HUB connected on a successful login', async () => {
    http.post.mockReturnValue(of({ data: { token: 'jwt-xyz' } }));
    const res = await service.testRegistryConnection('r1');
    expect(res.ok).toBe(true);
    expect(prisma.registryConfig.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { isConnected: true, connectionError: null },
    });
  });

  it('records the error and returns ok:false when a connection test throws', async () => {
    prisma.registryConfig.findUnique.mockResolvedValue(
      row({ type: RegistryProviderType.ECR }),
    );
    const res = await service.testRegistryConnection('r1');
    expect(res.ok).toBe(false);
    expect(prisma.registryConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isConnected: false }),
      }),
    );
  });
});
