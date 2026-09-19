import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkspaceStatus, WorkspaceType } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';

/** Read models for the platform back-office. No customer mutation lives here. */
@Injectable()
export class StaffPlatformReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const clientFilter = { legacyStaffRetiredAt: null } as const;
    const [totalUsers, activeUsers, scheduledUsers, workspaceAgg, subs] =
      await Promise.all([
        this.prisma.user.count({ where: clientFilter }),
        this.prisma.user.count({
          where: { ...clientFilter, isActive: true },
        }),
        this.prisma.user.count({
          where: { ...clientFilter, deletionScheduledFor: { not: null } },
        }),
        this.prisma.team.groupBy({
          by: ['type', 'status'],
          _count: { id: true },
        }),
        this.prisma.subscription.groupBy({
          by: ['status'],
          _count: { id: true },
        }),
      ]);
    const byStatus = Object.fromEntries(
      subs.map((subscription) => [subscription.status, subscription._count.id]),
    );
    const recentUsers = await this.prisma.user.findMany({
      where: clientFilter,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        deletionScheduledFor: true,
        createdAt: true,
        _count: {
          select: { teams: { where: { status: 'ACTIVE' } } },
        },
      },
    });
    const workspaceCount = (type?: WorkspaceType, status?: WorkspaceStatus) =>
      workspaceAgg
        .filter(
          (item) =>
            (type === undefined || item.type === type) &&
            (status === undefined || item.status === status),
        )
        .reduce((total, item) => total + item._count.id, 0);
    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        disabled: totalUsers - activeUsers,
        deletionScheduled: scheduledUsers,
      },
      teams: {
        total: workspaceCount(),
        personal: workspaceCount(WorkspaceType.PERSONAL),
        organizations: workspaceCount(WorkspaceType.ORGANIZATION),
        active: workspaceCount(undefined, WorkspaceStatus.ACTIVE),
        suspended: workspaceCount(undefined, WorkspaceStatus.SUSPENDED),
      },
      subscriptions: {
        total: subs.reduce(
          (total, subscription) => total + subscription._count.id,
          0,
        ),
        active: byStatus['ACTIVE'] ?? 0,
        trialing: byStatus['TRIALING'] ?? 0,
        canceled: byStatus['CANCELED'] ?? 0,
      },
      recentUsers,
    };
  }

  async listUsers(pagination?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: 'active' | 'disabled' | 'deletion-scheduled';
  }) {
    const page = Math.max(1, Number(pagination?.page) || 1);
    const take = Math.min(100, Math.max(1, Number(pagination?.limit) || 50));
    const search = pagination?.search?.trim();
    const where: Prisma.UserWhereInput = {
      legacyStaffRetiredAt: null,
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { fullName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(pagination?.status === 'active'
        ? { isActive: true, deletionScheduledFor: null }
        : pagination?.status === 'disabled'
          ? { isActive: false, deletionScheduledFor: null }
          : pagination?.status === 'deletion-scheduled'
            ? { deletionScheduledFor: { not: null } }
            : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * take,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          isActive: true,
          emailVerifiedAt: true,
          deletionScheduledFor: true,
          createdAt: true,
          updatedAt: true,
          teams: {
            where: { status: 'ACTIVE' },
            select: {
              role: true,
              status: true,
              canManageBilling: true,
              team: {
                select: { id: true, name: true, type: true, status: true },
              },
            },
          },
        },
      }),
    ]);
    return { total, page, limit: take, items };
  }

  async listTeams(pagination?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: WorkspaceType;
    status?: WorkspaceStatus;
  }) {
    const page = Math.max(1, Number(pagination?.page) || 1);
    const take = Math.min(100, Math.max(1, Number(pagination?.limit) || 50));
    const search = pagination?.search?.trim();
    const where: Prisma.TeamWhereInput = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(pagination?.type ? { type: pagination.type } : {}),
      ...(pagination?.status ? { status: pagination.status } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.team.count({ where }),
      this.prisma.team.findMany({
        where,
        skip: (page - 1) * take,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          type: true,
          status: true,
          createdAt: true,
          _count: { select: { members: true, projects: true, servers: true } },
        },
      }),
    ]);
    return { total, page, limit: take, items };
  }

  async getUser(userId: string) {
    await this.assertClientUserExists(userId);
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        provider: true,
        isActive: true,
        emailVerifiedAt: true,
        deletionRequestedAt: true,
        deletionScheduledFor: true,
        createdAt: true,
        updatedAt: true,
        teams: {
          orderBy: { joinedAt: 'asc' },
          select: {
            role: true,
            status: true,
            canManageBilling: true,
            joinedAt: true,
            team: {
              select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                type: true,
                status: true,
                createdAt: true,
                _count: {
                  select: { members: true, projects: true, servers: true },
                },
              },
            },
          },
        },
        _count: {
          select: {
            projects: true,
            deployments: true,
            builds: true,
            sshKeys: true,
          },
        },
      },
    });
  }

  async getTeam(teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        organizationProfile: true,
        members: {
          orderBy: { joinedAt: 'asc' },
          select: {
            role: true,
            status: true,
            canManageBilling: true,
            joinedAt: true,
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                isActive: true,
                deletionScheduledFor: true,
              },
            },
          },
        },
        invitations: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
            deliveryStatus: true,
            deliveryAttempts: true,
            deliveredAt: true,
            expiresAt: true,
            invitedByName: true,
            invitedByEmail: true,
            createdAt: true,
          },
        },
        subscription: {
          select: {
            id: true,
            plan: true,
            status: true,
            currentPeriodEnd: true,
            trialEndsAt: true,
          },
        },
        _count: { select: { members: true, projects: true, servers: true } },
      },
    });
    if (!team) throw new NotFoundException('Workspace introuvable');
    return team;
  }

  listSubscriptions() {
    return this.prisma.subscription.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        plan: true,
        status: true,
        currentPeriodEnd: true,
        trialEndsAt: true,
        canceledAt: true,
        createdAt: true,
        team: { select: { id: true, name: true } },
      },
    });
  }

  async listAudit(pagination?: { page?: number; limit?: number }) {
    const page = Math.max(1, Number(pagination?.page) || 1);
    const take = Math.min(200, Math.max(1, Number(pagination?.limit) || 50));
    const [total, items] = await Promise.all([
      this.prisma.staffAuditLog.count(),
      this.prisma.staffAuditLog.findMany({
        skip: (page - 1) * take,
        take,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { total, page, limit: take, items };
  }

  private async assertClientUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { legacyStaffRetiredAt: true },
    });
    if (!user || user.legacyStaffRetiredAt) {
      throw new NotFoundException('Utilisateur introuvable');
    }
  }
}
