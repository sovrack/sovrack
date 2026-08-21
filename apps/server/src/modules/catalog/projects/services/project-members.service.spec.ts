import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { ProjectsService } from '../projects.service';
import { WorkspaceAccessService } from '../../../iam/authorization/workspace-access.service';
import { ProjectActions } from '../../../iam/authorization/workspace-policy.types';
import { ProjectMembersService } from './project-members.service';

describe('ProjectMembersService', () => {
  let prisma: {
    user: { findUnique: jest.Mock };
    project: { findUnique: jest.Mock };
    projectMember: {
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let projects: {
    findOne: jest.Mock;
  };
  let workspaceAccess: {
    assertProjectAction: jest.Mock;
    assertUserIsActiveMember: jest.Mock;
  };
  let service: ProjectMembersService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u2' }) },
      project: {
        findUnique: jest.fn().mockResolvedValue({ teamId: 'workspace-1' }),
      },
      projectMember: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    projects = {
      findOne: jest.fn().mockResolvedValue({ id: 'p1', members: [] }),
    };
    workspaceAccess = {
      assertProjectAction: jest.fn().mockResolvedValue(undefined),
      assertUserIsActiveMember: jest.fn().mockResolvedValue(undefined),
    };
    service = new ProjectMembersService(
      prisma as unknown as PrismaService,
      projects as unknown as ProjectsService,
      workspaceAccess as unknown as WorkspaceAccessService,
    );
  });

  it('adds a member (default DEVELOPER) after a manage check', async () => {
    await service.addMember('p1', 'owner', Role.OWNER, {
      userId: 'u2',
    } as never);
    expect(workspaceAccess.assertProjectAction).toHaveBeenCalledWith(
      'p1',
      'owner',
      ProjectActions.MANAGE_MEMBERS,
      undefined,
    );
    expect(workspaceAccess.assertUserIsActiveMember).toHaveBeenCalledWith(
      'workspace-1',
      'u2',
    );
    expect(prisma.projectMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u2',
          teamId: 'workspace-1',
          role: ProjectRole.DEVELOPER,
        }),
      }),
    );
  });

  it('looks a user up by lowercased email', async () => {
    await service.addMember('p1', 'owner', Role.OWNER, {
      email: 'A@B.COM',
    } as never);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'a@b.com' },
    });
  });

  it('404s when the target user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.addMember('p1', 'owner', Role.OWNER, {
        userId: 'ghost',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('conflicts when the user is already a member', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.DEVELOPER,
    });
    await expect(
      service.addMember('p1', 'owner', Role.OWNER, { userId: 'u2' } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows removing an explicit maintainer membership', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.MAINTAINER,
    });
    await service.removeMember('p1', 'owner', Role.OWNER, 'u2');
    expect(prisma.projectMember.delete).toHaveBeenCalled();
  });

  it('removes a non-owner member', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.DEVELOPER,
    });
    await service.removeMember('p1', 'owner', Role.OWNER, 'u2');
    expect(prisma.projectMember.delete).toHaveBeenCalled();
  });

  it('getMembers enforces project access', async () => {
    await service.getMembers('p1', 'u1', Role.OWNER);
    expect(workspaceAccess.assertProjectAction).toHaveBeenCalledWith(
      'p1',
      'u1',
      ProjectActions.READ,
      undefined,
    );
  });
});
