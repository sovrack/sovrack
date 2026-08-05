import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole, Role } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { ProjectsService } from '../projects.service';
import { ProjectMembersService } from './project-members.service';

describe('ProjectMembersService', () => {
  let prisma: {
    user: { findUnique: jest.Mock };
    projectMember: {
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let projects: {
    assertCanManageProject: jest.Mock;
    assertCanAccessProject: jest.Mock;
    findOne: jest.Mock;
  };
  let service: ProjectMembersService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u2' }) },
      projectMember: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    projects = {
      assertCanManageProject: jest.fn().mockResolvedValue(undefined),
      assertCanAccessProject: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue({ id: 'p1', members: [] }),
    };
    service = new ProjectMembersService(
      prisma as unknown as PrismaService,
      projects as unknown as ProjectsService,
    );
  });

  it('adds a member (default DEVELOPER) after a manage check', async () => {
    await service.addMember('p1', 'owner', Role.OWNER, {
      userId: 'u2',
    } as never);
    expect(projects.assertCanManageProject).toHaveBeenCalled();
    expect(prisma.projectMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u2',
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

  it('refuses to remove the project OWNER', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      role: ProjectRole.OWNER,
    });
    await expect(
      service.removeMember('p1', 'owner', Role.OWNER, 'u2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
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
    expect(projects.assertCanAccessProject).toHaveBeenCalledWith(
      'p1',
      'u1',
      Role.OWNER,
    );
  });
});
