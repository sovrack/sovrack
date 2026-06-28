import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import { ServiceEnvironmentsService } from './service-environments.service';
import { ProjectAccessService } from '../access/project-access.service';

describe('ServiceEnvironmentsService', () => {
  let prisma: {
    project: { findUnique: jest.Mock };
    projectMember: { findUnique: jest.Mock };
    service: { findFirst: jest.Mock };
    environment: { findFirst: jest.Mock; findMany: jest.Mock };
    serviceEnvironment: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    domain: { count: jest.Mock };
  };
  let crypto: { encrypt: jest.Mock };
  let service: ServiceEnvironmentsService;

  const dto = { serviceId: 'svc1', environmentId: 'env1' };

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'p1' }) },
      projectMember: {
        findUnique: jest.fn().mockResolvedValue({ role: ProjectRole.OWNER }),
      },
      service: { findFirst: jest.fn().mockResolvedValue({ id: 'svc1' }) },
      environment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'env1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      serviceEnvironment: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({ id: 'se1' }),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'se1', ...data }),
          ),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'se1', ...data }),
          ),
      },
      domain: { count: jest.fn().mockResolvedValue(0) },
    };
    crypto = { encrypt: jest.fn((v: string) => `enc:${v}`) };
    service = new ServiceEnvironmentsService(
      prisma as unknown as PrismaService,
      crypto as unknown as CryptoService,
      new ProjectAccessService(prisma as unknown as PrismaService),
    );
  });

  it('creates a fresh link and encrypts secretsEnv', async () => {
    await service.link(
      'p1',
      { ...dto, secretsEnv: 'K=v' } as never,
      'admin',
      Role.ADMIN,
    );
    expect(crypto.encrypt).toHaveBeenCalledWith('K=v');
    expect(prisma.serviceEnvironment.create).toHaveBeenCalled();
  });

  it('rejects linking when the service is not in the project', async () => {
    prisma.service.findFirst.mockResolvedValue(null);
    await expect(
      service.link('p1', dto as never, 'admin', Role.ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('conflicts when an active link already exists', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue({
      id: 'se1',
      archivedAt: null,
    });
    await expect(
      service.link('p1', dto as never, 'admin', Role.ADMIN),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reactivates an archived link instead of creating a new row', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue({
      id: 'se1',
      archivedAt: new Date(),
    });
    await service.link('p1', dto as never, 'admin', Role.ADMIN);
    expect(prisma.serviceEnvironment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ archivedAt: null }),
      }),
    );
    expect(prisma.serviceEnvironment.create).not.toHaveBeenCalled();
  });

  it('bumps generation on update', async () => {
    await service.update(
      'p1',
      'se1',
      { port: 8080 } as never,
      'admin',
      Role.ADMIN,
    );
    expect(prisma.serviceEnvironment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ generation: { increment: 1 } }),
      }),
    );
  });

  it('blocks unlink while domains still point to the link', async () => {
    prisma.domain.count.mockResolvedValue(2);
    await expect(
      service.unlink('p1', 'se1', 'admin', Role.ADMIN),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('soft-deletes on unlink when no domains are attached', async () => {
    prisma.domain.count.mockResolvedValue(0);
    await service.unlink('p1', 'se1', 'admin', Role.ADMIN);
    expect(prisma.serviceEnvironment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ archivedAt: expect.any(Date) }),
      }),
    );
  });

  it('forbids a non-owner member from managing (link)', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.DEVELOPER,
    });
    await expect(
      service.link('p1', dto as never, 'u2', Role.DEVELOPER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
