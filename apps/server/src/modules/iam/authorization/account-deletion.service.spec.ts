import { BadRequestException } from '@nestjs/common';
import {
  MembershipStatus,
  WorkspaceRole,
  WorkspaceStatus,
  WorkspaceType,
} from '@prisma/client';
import { AccountDeletionService } from './account-deletion.service';

describe('AccountDeletionService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    team: { updateMany: jest.fn(), deleteMany: jest.fn() },
    teamMember: { count: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: AccountDeletionService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (operation: (tx: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    );
    prisma.teamMember.count.mockResolvedValue(1);
    prisma.team.updateMany.mockResolvedValue({ count: 1 });
    prisma.team.deleteMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({});
    prisma.user.delete.mockResolvedValue({});
    service = new AccountDeletionService(prisma as never);
  });

  it('refuses deletion while an organization would lose its last owner', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      deletionScheduledFor: null,
      teams: [
        {
          teamId: 'organization-1',
          team: { type: WorkspaceType.ORGANIZATION },
        },
      ],
    });
    prisma.teamMember.count.mockResolvedValue(0);

    await expect(
      service.scheduleIdentityDeletion('user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('deactivates the identity, revokes sessions and preserves organizations', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      deletionScheduledFor: null,
      teams: [
        {
          teamId: 'personal-1',
          team: { type: WorkspaceType.PERSONAL },
        },
        {
          teamId: 'organization-1',
          team: { type: WorkspaceType.ORGANIZATION },
        },
      ],
    });

    const result = await service.scheduleIdentityDeletion('user-1');

    expect(prisma.teamMember.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        teamId: 'organization-1',
        role: WorkspaceRole.OWNER,
        status: MembershipStatus.ACTIVE,
      }),
    });
    expect(prisma.team.updateMany).toHaveBeenCalledWith({
      where: {
        personalOwnerId: 'user-1',
        type: WorkspaceType.PERSONAL,
        status: WorkspaceStatus.ACTIVE,
      },
      data: { status: WorkspaceStatus.DELETION_PENDING },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        isActive: false,
        sessionVersion: { increment: 1 },
        deletionScheduledFor: expect.any(Date),
      }),
    });
    expect(result.scheduledFor.getTime()).toBeGreaterThan(Date.now());
  });

  it('restores the identity and its personal workspace during the grace period', async () => {
    prisma.user.findUnique.mockResolvedValue({
      email: 'owner@example.com',
      deletionScheduledFor: new Date(Date.now() + 60_000),
    });

    await expect(service.cancelIdentityDeletion('user-1')).resolves.toEqual({
      email: 'owner@example.com',
      restored: true,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        isActive: true,
        sessionVersion: { increment: 1 },
        deletionRequestedAt: null,
        deletionScheduledFor: null,
      },
    });
    expect(prisma.team.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: WorkspaceStatus.ACTIVE },
      }),
    );
  });

  it('purges only identities whose grace period is over', async () => {
    const expired = new Date(Date.now() - 60_000);
    prisma.user.findMany.mockResolvedValue([{ id: 'user-1' }]);
    prisma.user.findUnique.mockResolvedValue({ deletionScheduledFor: expired });

    await service.purgeDueIdentities();

    expect(prisma.team.deleteMany).toHaveBeenCalledWith({
      where: {
        personalOwnerId: 'user-1',
        type: WorkspaceType.PERSONAL,
        status: WorkspaceStatus.DELETION_PENDING,
      },
    });
    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
  });
});
