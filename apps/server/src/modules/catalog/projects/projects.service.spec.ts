import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ProjectsService } from './projects.service';
import { ProjectAccessService } from '../access/project-access.service';

describe('ProjectsService', () => {
  let prisma: {
    project: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    projectMember: { findUnique: jest.Mock };
    service: { findMany: jest.Mock };
    environment: { findMany: jest.Mock };
    serviceEnvironment: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let service: ProjectsService;

  beforeEach(() => {
    prisma = {
      project: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'p1', name: 'P', members: [] }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ id: 'p1' }),
        update: jest.fn().mockResolvedValue({ id: 'p1', members: [] }),
        count: jest.fn().mockResolvedValue(0),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'o1', role: Role.DEVELOPER }),
      },
      projectMember: { findUnique: jest.fn().mockResolvedValue(null) },
      service: { findMany: jest.fn().mockResolvedValue([]) },
      environment: { findMany: jest.fn().mockResolvedValue([]) },
      serviceEnvironment: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new ProjectsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      new ProjectAccessService(prisma as unknown as PrismaService),
    );
  });

  it('creates a project, auto-adds the creator as OWNER, and audits it', async () => {
    await service.create('u1', Role.DEVELOPER, { name: 'P' } as never);
    expect(prisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          members: { create: { userId: 'u1', role: ProjectRole.OWNER } },
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      'u1',
      'PROJECT_CREATE',
      'Project',
      'p1',
      expect.anything(),
    );
  });

  it('builds the deployment matrix with live status + OutOfSync per cell', async () => {
    prisma.service.findMany.mockResolvedValue([
      { id: 'svc1', name: 'web', type: 'APPLICATION' },
    ]);
    prisma.environment.findMany.mockResolvedValue([
      { id: 'env1', name: 'staging', isProtected: false },
      { id: 'env2', name: 'production', isProtected: true },
    ]);
    prisma.serviceEnvironment.findMany.mockResolvedValue([
      // staging : config dérivée (generation 5 > observed 4) → OutOfSync
      {
        id: 'se1',
        serviceId: 'svc1',
        environmentId: 'env1',
        generation: 5,
        currentDeploymentId: 'dep1',
        currentDeployment: {
          id: 'dep1',
          status: 'SUCCESS',
          observedGeneration: 4,
          finishedAt: new Date('2026-06-28T00:00:00Z'),
          createdAt: new Date('2026-06-28T00:00:00Z'),
        },
      },
      // production : en phase (5 == 5), pas OutOfSync
      {
        id: 'se2',
        serviceId: 'svc1',
        environmentId: 'env2',
        generation: 5,
        currentDeploymentId: 'dep2',
        currentDeployment: {
          id: 'dep2',
          status: 'SUCCESS',
          observedGeneration: 5,
          finishedAt: new Date('2026-06-28T01:00:00Z'),
          createdAt: new Date('2026-06-28T01:00:00Z'),
        },
      },
    ]);

    const matrix = await service.getMatrix('p1', 'admin', Role.ADMIN);

    expect(matrix.services).toHaveLength(1);
    expect(matrix.environments).toHaveLength(2);
    expect(matrix.cells).toHaveLength(2);

    const staging = matrix.cells.find((c) => c.environmentId === 'env1');
    const prod = matrix.cells.find((c) => c.environmentId === 'env2');
    expect(staging).toMatchObject({ status: 'SUCCESS', outOfSync: true });
    expect(prod).toMatchObject({ status: 'SUCCESS', outOfSync: false });
  });

  it('forbids a non-admin from assigning a different owner', async () => {
    await expect(
      service.create('u1', Role.DEVELOPER, {
        name: 'P',
        ownerId: 'other',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an assigned owner that is not a DEVELOPER', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'o1', role: Role.ADMIN });
    await expect(
      service.create('admin', Role.ADMIN, {
        name: 'P',
        ownerId: 'o1',
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s when the assigned owner does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.create('admin', Role.ADMIN, {
        name: 'P',
        ownerId: 'ghost',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists all projects for an ADMIN (no membership filter)', async () => {
    await service.findAll('admin', Role.ADMIN);
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });

  it('filters projects by membership for a non-admin', async () => {
    await service.findAll('u1', Role.DEVELOPER);
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { members: { some: { userId: 'u1' } } },
      }),
    );
  });

  it('forbids a non-owner member from updating', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.DEVELOPER,
    });
    await expect(
      service.update('p1', 'u2', Role.DEVELOPER, { name: 'X' } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('restricts deletion to ADMIN and cascades within a transaction', async () => {
    const tx = {
      deployment: { deleteMany: jest.fn() },
      pipelineRun: { deleteMany: jest.fn() },
      build: { deleteMany: jest.fn() },
      dnsRecord: { deleteMany: jest.fn() },
      domain: { deleteMany: jest.fn() },
      environment: { deleteMany: jest.fn() },
      projectMember: { deleteMany: jest.fn() },
      project: { deleteMany: jest.fn() },
    };
    prisma.$transaction.mockImplementation(
      async (cb: (t: typeof tx) => unknown) => cb(tx),
    );

    await service.remove('p1', 'admin', Role.ADMIN);
    expect(tx.project.deleteMany).toHaveBeenCalledWith({ where: { id: 'p1' } });

    await expect(
      service.remove('p1', 'u1', Role.DEVELOPER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
