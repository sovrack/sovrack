import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  MembershipStatus,
  WorkspaceRole,
  WorkspaceStatus,
  WorkspaceType,
} from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { UsageGuardService } from '../../billing/usage-guard.service';
import { WorkspaceAccessService } from '../authorization/workspace-access.service';
import { WorkspaceActions } from '../authorization/workspace-policy.types';
import { TeamsService } from './teams.service';

describe('TeamsService', () => {
  let prisma: {
    team: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    teamMember: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let workspaceAccess: { assertWorkspaceAction: jest.Mock };
  let service: TeamsService;

  beforeEach(() => {
    prisma = {
      team: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({
          type: WorkspaceType.ORGANIZATION,
          status: WorkspaceStatus.ACTIVE,
        }),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 't1', members: [], ...data }),
          ),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 't1', members: [], ...data }),
          ),
        delete: jest.fn().mockResolvedValue({ id: 't1', name: 'Core' }),
      },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      teamMember: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    workspaceAccess = {
      assertWorkspaceAction: jest.fn().mockResolvedValue({
        workspaceRole: WorkspaceRole.OWNER,
      }),
    };
    service = new TeamsService(
      prisma as unknown as PrismaService,
      { guardForTeam: jest.fn() } as unknown as UsageGuardService,
      workspaceAccess as unknown as WorkspaceAccessService,
    );
  });

  it('scopes findOne through workspace authorization and 404s if absent', async () => {
    prisma.team.findUnique.mockResolvedValueOnce(null);
    await expect(service.findOne('nope', { id: 'u1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(workspaceAccess.assertWorkspaceAction).toHaveBeenCalledWith(
      'nope',
      'u1',
      WorkspaceActions.READ,
    );
  });

  it('creates a workspace with its creator as active OWNER', async () => {
    const result = await service.create(
      { name: ' Core ', description: ' Team ' },
      'u1',
    );

    expect(result.name).toBe('Core');
    expect(prisma.team.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Core',
          description: 'Team',
          members: {
            create: {
              userId: 'u1',
              role: WorkspaceRole.OWNER,
              status: MembershipStatus.ACTIVE,
            },
          },
        }),
      }),
    );
  });

  it('creates at most one personal workspace per owner', async () => {
    await service.create(
      { name: 'Habib — Personnel', type: WorkspaceType.PERSONAL },
      'u1',
    );
    expect(prisma.team.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: WorkspaceType.PERSONAL,
          personalOwnerId: 'u1',
        }),
      }),
    );

    prisma.team.findFirst.mockResolvedValueOnce({ id: 'personal-1' });
    await expect(
      service.create({ name: 'Second', type: WorkspaceType.PERSONAL }, 'u1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('authorizes workspace updates before writing', async () => {
    await service.update('t1', { name: 'Renamed' }, { id: 'u1' });

    expect(workspaceAccess.assertWorkspaceAction).toHaveBeenCalledWith(
      't1',
      'u1',
      WorkspaceActions.UPDATE,
    );
    expect(prisma.team.update).toHaveBeenCalled();
  });

  it('never removes the last active workspace OWNER', async () => {
    prisma.teamMember.findUnique.mockResolvedValue({
      userId: 'u1',
      role: WorkspaceRole.OWNER,
      status: MembershipStatus.ACTIVE,
    });
    prisma.teamMember.count.mockResolvedValue(0);

    await expect(
      service.removeMember('t1', 'u1', { id: 'u1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.teamMember.delete).not.toHaveBeenCalled();
  });

  it('lets an active member leave an organization', async () => {
    prisma.teamMember.findUnique.mockResolvedValue({
      userId: 'u1',
      role: WorkspaceRole.MEMBER,
      status: MembershipStatus.ACTIVE,
    });

    await service.leaveWorkspace('t1', { id: 'u1' });

    expect(workspaceAccess.assertWorkspaceAction).toHaveBeenCalledWith(
      't1',
      'u1',
      WorkspaceActions.READ,
    );
    expect(prisma.teamMember.delete).toHaveBeenCalledWith({
      where: { teamId_userId: { teamId: 't1', userId: 'u1' } },
    });
  });

  it('does not let the last active owner leave an organization', async () => {
    prisma.teamMember.findUnique.mockResolvedValue({
      userId: 'u1',
      role: WorkspaceRole.OWNER,
      status: MembershipStatus.ACTIVE,
    });
    prisma.teamMember.count.mockResolvedValue(0);

    await expect(
      service.leaveWorkspace('t1', { id: 'u1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.teamMember.delete).not.toHaveBeenCalled();
  });
});
