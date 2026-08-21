import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole, WorkspaceRole } from '@prisma/client';
import { WorkspaceAccessService } from './workspace-access.service';
import { ProjectActions, WorkspaceActions } from './workspace-policy.types';

function make() {
  const prisma = {
    teamMember: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    project: { findUnique: jest.fn() },
    server: { findUnique: jest.fn() },
  };
  const service = new WorkspaceAccessService(prisma as never);
  return { prisma, service };
}

describe('WorkspaceAccessService', () => {
  it.each([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER])(
    'allows %s to read an active workspace',
    async (role) => {
      const { prisma, service } = make();
      prisma.teamMember.findUnique.mockResolvedValue({
        role,
        status: 'ACTIVE',
        user: { isActive: true },
      });
      await expect(
        service.assertWorkspaceAction('w1', 'u1', WorkspaceActions.READ),
      ).resolves.toMatchObject({ workspaceRole: role });
    },
  );

  it('denies MEMBER workspace administration', async () => {
    const { prisma, service } = make();
    prisma.teamMember.findUnique.mockResolvedValue({
      role: WorkspaceRole.MEMBER,
      status: 'ACTIVE',
      user: { isActive: true },
    });
    await expect(
      service.assertWorkspaceAction('w1', 'u1', WorkspaceActions.UPDATE),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('hides foreign and suspended workspaces', async () => {
    const { prisma, service } = make();
    prisma.teamMember.findUnique.mockResolvedValue(null);
    await expect(
      service.assertWorkspaceAction('w2', 'u1', WorkspaceActions.READ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requires explicit context when a user has multiple workspaces', async () => {
    const { prisma, service } = make();
    prisma.teamMember.findMany.mockResolvedValue([
      { teamId: 'w1' },
      { teamId: 'w2' },
    ]);
    await expect(service.resolveWorkspaceId('u1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([WorkspaceRole.OWNER, WorkspaceRole.ADMIN])(
    'grants inherited maintainer access to workspace %s',
    async (role) => {
      const { prisma, service } = make();
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        teamId: 'w1',
        members: [],
      });
      prisma.teamMember.findUnique.mockResolvedValue({
        role,
        status: 'ACTIVE',
        user: { isActive: true },
      });
      await expect(
        service.assertProjectAction('p1', 'u1', ProjectActions.ROLLBACK),
      ).resolves.toMatchObject({
        effectiveProjectRole: ProjectRole.MAINTAINER,
      });
    },
  );

  it('allows a developer to deploy but not to protected environments', async () => {
    const { prisma, service } = make();
    prisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      teamId: 'w1',
      members: [{ role: ProjectRole.DEVELOPER }],
    });
    prisma.teamMember.findUnique.mockResolvedValue({
      role: WorkspaceRole.MEMBER,
      status: 'ACTIVE',
      user: { isActive: true },
    });
    await expect(
      service.assertProjectAction('p1', 'u1', ProjectActions.DEPLOY),
    ).resolves.toBeDefined();
    await expect(
      service.assertProjectAction('p1', 'u1', ProjectActions.DEPLOY_PROTECTED),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('hides a project from a workspace member without project assignment', async () => {
    const { prisma, service } = make();
    prisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      teamId: 'w1',
      members: [],
    });
    prisma.teamMember.findUnique.mockResolvedValue({
      role: WorkspaceRole.MEMBER,
      status: 'ACTIVE',
      user: { isActive: true },
    });
    await expect(
      service.assertProjectAction('p1', 'u1', ProjectActions.READ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
