import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectRole, Role, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ProjectsService } from './projects.service';
import { ProjectAccessService } from '../authorization/project-access.service';
import { UsageGuardService } from '../../billing/usage-guard.service';
import { WorkspaceAccessService } from '../../iam/authorization/workspace-access.service';

describe('ProjectsService', () => {
  let prisma: {
    project: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    projectMember: { create: jest.Mock; findUnique: jest.Mock };
    teamMember: { findFirst: jest.Mock; count: jest.Mock };
    server: { count: jest.Mock };
    volume: { count: jest.Mock };
    subscription: { findUnique: jest.Mock; create: jest.Mock };
    planLimit: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let workspaceAccess: {
    resolveWorkspaceId: jest.Mock;
    assertWorkspaceAction: jest.Mock;
    assertProjectAction: jest.Mock;
    assertUserIsActiveMember: jest.Mock;
  };
  let service: ProjectsService;

  beforeEach(() => {
    prisma = {
      project: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'p1', name: 'P', members: [] }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ id: 'p1' }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'p1', name: 'P', members: [] }),
        findFirst: jest.fn().mockResolvedValue({ id: 'p1' }),
        update: jest.fn().mockResolvedValue({ id: 'p1', members: [] }),
        count: jest.fn().mockResolvedValue(0),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'o1', role: Role.MEMBER }),
      },
      projectMember: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      },
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
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    const usageGuard = {
      guardForTeam: jest.fn().mockResolvedValue(undefined),
    } as unknown as UsageGuardService;
    workspaceAccess = {
      resolveWorkspaceId: jest.fn().mockResolvedValue('t1'),
      assertWorkspaceAction: jest.fn().mockResolvedValue({
        workspaceId: 't1',
        userId: 'u1',
        workspaceRole: WorkspaceRole.MEMBER,
      }),
      assertProjectAction: jest.fn().mockResolvedValue({}),
      assertUserIsActiveMember: jest.fn().mockResolvedValue(undefined),
    };
    service = new ProjectsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      new ProjectAccessService(
        prisma as unknown as PrismaService,
        {
          assertProjectAction: jest
            .fn()
            .mockImplementation(async (_projectId, _userId, action) => {
              const member = await prisma.projectMember.findUnique();
              if (!member) throw new NotFoundException('Projet introuvable');
              if (
                action !== 'project.read' &&
                member.role !== ProjectRole.MAINTAINER
              ) {
                throw new ForbiddenException('Action projet interdite');
              }
            }),
        } as never,
      ),
      usageGuard,
      workspaceAccess as unknown as WorkspaceAccessService,
    );
  });

  it('creates a project, adds its maintainer in the workspace, and audits it', async () => {
    await service.create('u1', Role.MEMBER, { name: 'P' } as never);
    expect(prisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'P',
          teamId: 't1',
        }),
      }),
    );
    expect(prisma.projectMember.create).toHaveBeenCalledWith({
      data: {
        projectId: 'p1',
        teamId: 't1',
        userId: 'u1',
        role: ProjectRole.MAINTAINER,
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      'u1',
      'PROJECT_CREATE',
      'Project',
      'p1',
      expect.anything(),
    );
  });

  it('forbids project creation when workspace policy rejects it', async () => {
    workspaceAccess.assertWorkspaceAction.mockRejectedValueOnce(
      new ForbiddenException('Action workspace interdite'),
    );
    await expect(
      service.create('u1', Role.MEMBER, {
        name: 'P',
        ownerId: 'other',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s when the assigned maintainer is not an active workspace member', async () => {
    workspaceAccess.assertUserIsActiveMember.mockRejectedValueOnce(
      new NotFoundException('Membre du workspace introuvable'),
    );
    await expect(
      service.create('admin', Role.OWNER, {
        name: 'P',
        ownerId: 'ghost',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('filters projects by membership for a workspace MEMBER', async () => {
    await service.findAll('admin', Role.OWNER);
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          teamId: 't1',
          members: { some: { userId: 'admin' } },
        },
      }),
    );
  });

  it('gives a workspace OWNER access to every project in the workspace', async () => {
    workspaceAccess.assertWorkspaceAction.mockResolvedValueOnce({
      workspaceId: 't1',
      userId: 'u1',
      workspaceRole: WorkspaceRole.OWNER,
    });
    await service.findAll('u1', Role.OWNER);
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamId: 't1' },
      }),
    );
  });

  it('filters projects by membership for a non-admin', async () => {
    await service.findAll('u1', Role.MEMBER);
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          teamId: 't1',
          members: { some: { userId: 'u1' } },
        },
      }),
    );
  });

  it('forbids a non-owner member from updating', async () => {
    workspaceAccess.assertProjectAction.mockRejectedValueOnce(
      new ForbiddenException('Action projet interdite'),
    );
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

    workspaceAccess.assertWorkspaceAction.mockRejectedValueOnce(
      new ForbiddenException('Action workspace interdite'),
    );
    await expect(
      service.remove('p1', 'u1', Role.MEMBER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
