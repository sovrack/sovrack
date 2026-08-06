import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import { ServiceEnvironmentsService } from '../service-environments/service-environments.service';
import { EnvironmentsService } from './environments.service';
import { ProjectAccessService } from '../authorization/project-access.service';

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
  let crypto: { encryptOptional: jest.Mock };
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
    crypto = {
      encryptOptional: jest.fn((v?: string | null) => (v ? `enc:${v}` : null)),
    };
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

  it('lets an OWNER create an env and encrypts secretsEnv', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.OWNER,
    });
    await service.create(
      'p1',
      { name: 'prod', env: 'A=1', secretsEnv: 'S=2' } as never,
      'owner',
      Role.MEMBER,
    );
    expect(crypto.encryptOptional).toHaveBeenCalledWith('S=2');
  });

  // A9 harmonization (see EXPLORATION_BACKEND_DEPENDANCES.md): environments
  // now use encryptOptional like ServicesService, so an explicit '' clears
  // the secret (→ null) instead of persisting an encrypted empty string.
  it('clears secretsEnv (→ null) when an empty string is submitted', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.OWNER,
    });
    await service.create(
      'p1',
      { name: 'prod', secretsEnv: '' } as never,
      'owner',
      Role.MEMBER,
    );
    expect(crypto.encryptOptional).toHaveBeenCalledWith('');
    expect(prisma.environment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ secretsEnv: null }),
      }),
    );
  });

  // A3 (clôture finale): linkService's upsert was the one A9 write path missing
  // omit: { secretsEnv: true } — every other read/write in this service already
  // had it. Assert the fix directly rather than trusting the return value.
  it('never returns raw secretsEnv from linkService (omit applied)', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.OWNER,
    });
    await service.linkService('p1', 'e1', 'svc1', 'owner', Role.MEMBER);
    expect(prisma.serviceEnvironment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ omit: { secretsEnv: true } }),
    );
  });

  // Regression test for AUDIT_VERIFICATION_UI.md Task 2: `findAll` used to
  // `include: { serviceLinks: { include: { service, deployments } } }` with
  // no `select` directly on serviceLinks — Prisma then returns every scalar
  // column of the underlying ServiceEnvironment row, including plaintext
  // `env` and encrypted `secretsEnv`, on every environments-list load.
  it('findAll requests serviceLinks via an explicit select excluding secretsEnv/env', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.DEVELOPER,
    });

    await service.findAll('p1', 'u2', Role.MEMBER);

    const arg = prisma.environment.findMany.mock.calls[0][0];
    const serviceLinks = arg.include.serviceLinks;
    expect(serviceLinks.include).toBeUndefined();
    expect(serviceLinks.select).not.toHaveProperty('secretsEnv');
    expect(serviceLinks.select).not.toHaveProperty('env');
    expect(serviceLinks.select).toMatchObject({
      id: true,
      serviceId: true,
      environmentId: true,
    });
  });

  // Soft-deleted services (renamed `<name>_archived_<ts>` + archivedAt set)
  // used to still appear in the Project environments dialog. findAll must
  // filter serviceLinks to active links pointing at active services only.
  it('findAll filters out archived service links and archived services', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.DEVELOPER,
    });

    await service.findAll('p1', 'u2', Role.MEMBER);

    const arg = prisma.environment.findMany.mock.calls[0][0];
    const serviceLinks = arg.include.serviceLinks;
    expect(serviceLinks.where).toEqual({
      archivedAt: null,
      service: { archivedAt: null },
    });
  });

  it('forbids a non-member from reading project envs', async () => {
    prisma.projectMember.findUnique.mockResolvedValue(null);
    await expect(
      service.findAll('p1', 'u2', Role.MEMBER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a project member to read envs', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.DEVELOPER,
    });
    await expect(service.findAll('p1', 'u2', Role.MEMBER)).resolves.toEqual([]);
  });

  it('restricts management (create) to OWNER or ADMIN', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.DEVELOPER,
    });
    await expect(
      service.create('p1', { name: 'x' } as never, 'u2', Role.MEMBER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a project OWNER to manage', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.OWNER,
    });
    await expect(
      service.create('p1', { name: 'x' } as never, 'owner', Role.MEMBER),
    ).resolves.toMatchObject({ name: 'x' });
  });

  it('404s findOne when the env does not exist', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.OWNER,
    });
    prisma.environment.findFirst.mockResolvedValue(null);
    await expect(
      service.findOne('p1', 'nope', 'owner', Role.MEMBER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s assignServer when the server is missing', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.OWNER,
    });
    prisma.server.findUnique.mockResolvedValue(null);
    await expect(
      service.assignServer('p1', 'e1', 'nope', 'owner', Role.MEMBER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the project does not exist', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(
      service.findAll('nope', 'owner', Role.MEMBER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
