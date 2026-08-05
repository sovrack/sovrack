import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ProjectsService } from './projects.service';
import { ProjectAccessService } from '../authorization/project-access.service';
import { UsageGuardService } from '../../billing/usage-guard.service';
import { BillingService } from '../../billing/billing.service';

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
    teamMember: { findFirst: jest.Mock; count: jest.Mock };
    server: { count: jest.Mock };
    volume: { count: jest.Mock };
    subscription: { findUnique: jest.Mock; create: jest.Mock };
    planLimit: { findUnique: jest.Mock };
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
          .mockResolvedValue({ id: 'o1', role: Role.MEMBER }),
      },
      projectMember: { findUnique: jest.fn().mockResolvedValue(null) },
      teamMember: {
        findFirst: jest.fn().mockResolvedValue({ teamId: 't1' }),
        count: jest.fn().mockResolvedValue(0),
      },
      server: { count: jest.fn().mockResolvedValue(0) },
      volume: { count: jest.fn().mockResolvedValue(0) },
      subscription: {
        findUnique: jest.fn().mockResolvedValue({
          id: 's1',
          teamId: 't1',
          plan: 'FREE',
          status: 'TRIALING',
        }),
        create: jest.fn().mockResolvedValue({
          id: 's1',
          teamId: 't1',
          plan: 'FREE',
          status: 'TRIALING',
        }),
      },
      planLimit: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    const billing = new BillingService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
    const usageGuard = new UsageGuardService(
      prisma as unknown as PrismaService,
      billing,
    );
    service = new ProjectsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      new ProjectAccessService(prisma as unknown as PrismaService),
      usageGuard,
      billing,
    );
  });

  it('creates a project, auto-adds the creator as OWNER, and audits it', async () => {
    await service.create('u1', Role.MEMBER, { name: 'P' } as never);
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

  it('forbids a non-admin from assigning a different owner', async () => {
    await expect(
      service.create('u1', Role.MEMBER, {
        name: 'P',
        ownerId: 'other',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an assigned owner that is not a DEVELOPER', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'o1', role: Role.OWNER });
    await expect(
      service.create('admin', Role.OWNER, {
        name: 'P',
        ownerId: 'o1',
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s when the assigned owner does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.create('admin', Role.OWNER, {
        name: 'P',
        ownerId: 'ghost',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists all projects for a SUPER_ADMIN (no membership filter)', async () => {
    await service.findAll('admin', Role.SUPER_ADMIN);
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });

  it('filters projects by membership for an OWNER (tenant isolation)', async () => {
    await service.findAll('u1', Role.OWNER);
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { members: { some: { userId: 'u1' } } },
      }),
    );
  });

  it('filters projects by membership for a non-admin', async () => {
    await service.findAll('u1', Role.MEMBER);
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
      service.update('p1', 'u2', Role.MEMBER, { name: 'X' } as never),
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

    await service.remove('p1', 'admin', Role.OWNER);
    expect(tx.project.deleteMany).toHaveBeenCalledWith({ where: { id: 'p1' } });

    await expect(
      service.remove('p1', 'u1', Role.MEMBER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
