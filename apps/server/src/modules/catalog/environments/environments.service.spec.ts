import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import { ServiceEnvironmentsService } from '../service-environments/service-environments.service';
import { EnvironmentsService } from './environments.service';
import { ProjectAccessService } from '../access/project-access.service';

describe('EnvironmentsService', () => {
  let prisma: {
    project: { findUnique: jest.Mock };
    projectMember: { findUnique: jest.Mock };
    environment: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    server: { findUnique: jest.Mock };
    service: { findFirst: jest.Mock };
    serviceEnvironment: { upsert: jest.Mock };
  };
  let crypto: { encrypt: jest.Mock };
  let service: EnvironmentsService;

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'p1' }) },
      projectMember: { findUnique: jest.fn().mockResolvedValue(null) },
      environment: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'e1', name: data.name ?? 'x', ...data }),
          ),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'e1',
          projectId: 'p1',
          name: 'x',
          serviceLinks: [],
          servers: [],
        }),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'e1', ...data }),
          ),
        delete: jest.fn().mockResolvedValue({}),
      },
      server: { findUnique: jest.fn().mockResolvedValue({ id: 's1' }) },
      service: { findFirst: jest.fn().mockResolvedValue({ id: 'svc1' }) },
      serviceEnvironment: {
        upsert: jest.fn().mockResolvedValue({ id: 'se1' }),
      },
    };
    crypto = { encrypt: jest.fn((v: string) => `enc:${v}`) };
    const serviceEnvsService = {
      linkServiceToAllEnvsForEnvironment: jest
        .fn()
        .mockResolvedValue(undefined),
    } as unknown as ServiceEnvironmentsService;
    service = new EnvironmentsService(
      prisma as unknown as PrismaService,
      serviceEnvsService,
      crypto as unknown as CryptoService,
      new ProjectAccessService(prisma as unknown as PrismaService),
    );
  });

  it('lets an ADMIN create an env and encrypts secretsEnv', async () => {
    await service.create(
      'p1',
      { name: 'prod', env: 'A=1', secretsEnv: 'S=2' } as never,
      'admin',
      Role.ADMIN,
    );
    expect(crypto.encrypt).toHaveBeenCalledWith('S=2');
  });

  it('forbids a non-member from reading project envs', async () => {
    prisma.projectMember.findUnique.mockResolvedValue(null);
    await expect(
      service.findAll('p1', 'u2', Role.DEVELOPER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a project member to read envs', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.DEVELOPER,
    });
    await expect(service.findAll('p1', 'u2', Role.DEVELOPER)).resolves.toEqual(
      [],
    );
  });

  it('restricts management (create) to OWNER or ADMIN', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.DEVELOPER,
    });
    await expect(
      service.create('p1', { name: 'x' } as never, 'u2', Role.DEVELOPER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a project OWNER to manage', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.OWNER,
    });
    await expect(
      service.create('p1', { name: 'x' } as never, 'owner', Role.DEVELOPER),
    ).resolves.toMatchObject({ name: 'x' });
  });

  it('404s findOne when the env does not exist', async () => {
    prisma.environment.findFirst.mockResolvedValue(null);
    await expect(
      service.findOne('p1', 'nope', 'admin', Role.ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s assignServer when the server is missing', async () => {
    prisma.server.findUnique.mockResolvedValue(null);
    await expect(
      service.assignServer('p1', 'e1', 'nope', 'admin', Role.ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the project does not exist', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(
      service.findAll('nope', 'admin', Role.ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
