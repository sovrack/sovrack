import { ForbiddenException } from '@nestjs/common';
import {
  InvitationStatus,
  MembershipStatus,
  WorkspaceRole,
  WorkspaceStatus,
  WorkspaceType,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../../shared/database/prisma.service';
import { UsageGuardService } from '../../billing/usage-guard.service';
import { NotificationsSmtpService } from '../../notifications/notifications-smtp.service';
import { WorkspaceAccessService } from '../authorization/workspace-access.service';
import { WorkspaceInvitationsService } from './workspace-invitations.service';

describe('WorkspaceInvitationsService', () => {
  let prisma: {
    $transaction: jest.Mock;
    user: { findUnique: jest.Mock };
    team: { findUnique: jest.Mock };
    teamMember: { upsert: jest.Mock };
    workspaceInvitation: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let workspaceAccess: { assertWorkspaceAction: jest.Mock };
  let smtp: { sendTransactionalEmail: jest.Mock };
  let service: WorkspaceInvitationsService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      team: {
        findUnique: jest.fn().mockResolvedValue({
          type: WorkspaceType.ORGANIZATION,
          status: WorkspaceStatus.ACTIVE,
        }),
      },
      teamMember: { upsert: jest.fn().mockResolvedValue({}) },
      workspaceInvitation: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'inv-1',
            ...data,
            status: InvitationStatus.PENDING,
            createdAt: new Date('2026-08-17T00:00:00.000Z'),
            team: { id: 'workspace-1', name: 'Core', slug: 'core-1234' },
          }),
        ),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    workspaceAccess = {
      assertWorkspaceAction: jest.fn().mockResolvedValue({
        workspaceRole: WorkspaceRole.OWNER,
      }),
    };
    smtp = { sendTransactionalEmail: jest.fn().mockResolvedValue(undefined) };
    service = new WorkspaceInvitationsService(
      prisma as unknown as PrismaService,
      workspaceAccess as unknown as WorkspaceAccessService,
      { guardForTeam: jest.fn() } as unknown as UsageGuardService,
      smtp as unknown as NotificationsSmtpService,
    );
  });

  it('stores only a SHA-256 invitation token hash and normalizes email', async () => {
    await service.invite('workspace-1', 'actor-1', {
      email: ' Person@Example.COM ',
      role: WorkspaceRole.MEMBER,
    });

    const data = prisma.workspaceInvitation.create.mock.calls[0][0].data as {
      email: string;
      tokenHash: string;
    };
    const emailHtml = smtp.sendTransactionalEmail.mock.calls[0][2] as string;
    const encodedToken = emailHtml.match(/token=([^"&]+)/)?.[1];
    expect(encodedToken).toBeDefined();
    const rawToken = decodeURIComponent(encodedToken as string);

    expect(data.email).toBe('person@example.com');
    expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.tokenHash).toBe(
      createHash('sha256').update(rawToken).digest('hex'),
    );
    expect(JSON.stringify(data)).not.toContain(rawToken);
  });

  it('prevents an ADMIN from granting an elevated workspace role', async () => {
    workspaceAccess.assertWorkspaceAction.mockResolvedValue({
      workspaceRole: WorkspaceRole.ADMIN,
    });

    await expect(
      service.invite('workspace-1', 'actor-1', {
        email: 'person@example.com',
        role: WorkspaceRole.ADMIN,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.workspaceInvitation.create).not.toHaveBeenCalled();
  });

  it('accepts once and activates membership in the invitation workspace', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'person@example.com',
      isActive: true,
    });
    prisma.workspaceInvitation.findUnique.mockResolvedValue({
      id: 'inv-1',
      teamId: 'workspace-1',
      email: 'person@example.com',
      role: WorkspaceRole.MEMBER,
      status: InvitationStatus.PENDING,
      expiresAt: new Date(Date.now() + 60_000),
      team: {
        id: 'workspace-1',
        name: 'Core',
        slug: 'core-1234',
        type: WorkspaceType.ORGANIZATION,
      },
    });

    await service.accept('raw-token', 'user-1');

    expect(prisma.workspaceInvitation.findUnique).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256').update('raw-token').digest('hex'),
      },
      include: {
        team: {
          select: { id: true, name: true, slug: true, type: true },
        },
      },
    });
    expect(prisma.teamMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          teamId: 'workspace-1',
          userId: 'user-1',
          status: MembershipStatus.ACTIVE,
        }),
      }),
    );
    expect(prisma.workspaceInvitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-1', status: InvitationStatus.PENDING },
        data: expect.objectContaining({ status: InvitationStatus.ACCEPTED }),
      }),
    );
  });

  it('rejects acceptance from a different account email', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'other@example.com',
      isActive: true,
    });
    prisma.workspaceInvitation.findUnique.mockResolvedValue({
      id: 'inv-1',
      teamId: 'workspace-1',
      email: 'person@example.com',
      role: WorkspaceRole.MEMBER,
      status: InvitationStatus.PENDING,
      expiresAt: new Date(Date.now() + 60_000),
      team: {
        id: 'workspace-1',
        name: 'Core',
        slug: 'core-1234',
        type: WorkspaceType.ORGANIZATION,
      },
    });

    await expect(service.accept('raw-token', 'user-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
