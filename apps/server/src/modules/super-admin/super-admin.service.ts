import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';

export type SuperAdminOverview = {
  users: {
    total: number;
    active: number;
    owners: number;
    members: number;
  };
  teams: {
    total: number;
  };
  subscriptions: {
    total: number;
    active: number;
    trialing: number;
    canceled: number;
  };
  recentUsers: Array<{
    id: string;
    email: string;
    fullName: string;
    role: string;
    isActive: boolean;
    createdAt: Date;
  }>;
};

@Injectable()
export class SuperAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(): Promise<SuperAdminOverview> {
    const [userAgg, activeUsers, teamsTotal, subs] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['role'],
        _count: { id: true },
      }),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.team.count(),
      this.prisma.subscription.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
    ]);

    const byRole = Object.fromEntries(
      userAgg.map((r) => [r.role, r._count.id]),
    );
    const byStatus = Object.fromEntries(
      subs.map((s) => [s.status, s._count.id]),
    );

    const recentUsers = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return {
      users: {
        total: userAgg.reduce((acc, r) => acc + r._count.id, 0),
        active: activeUsers,
        owners: byRole['OWNER'] ?? 0,
        members: byRole['MEMBER'] ?? 0,
      },
      teams: { total: teamsTotal },
      subscriptions: {
        total: subs.reduce((acc, s) => acc + s._count.id, 0),
        active: byStatus['ACTIVE'] ?? 0,
        trialing: byStatus['TRIALING'] ?? 0,
        canceled: byStatus['CANCELED'] ?? 0,
      },
      recentUsers,
    };
  }

  async listUsers(pagination?: { page?: number; limit?: number }) {
    const page = Math.max(1, Number(pagination?.page) || 1);
    const take = Math.min(100, Math.max(1, Number(pagination?.limit) || 50));
    const [total, items] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        skip: (page - 1) * take,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      total,
      page,
      limit: take,
      items,
    };
  }

  async listTeams(pagination?: { page?: number; limit?: number }) {
    const page = Math.max(1, Number(pagination?.page) || 1);
    const take = Math.min(100, Math.max(1, Number(pagination?.limit) || 50));
    const [total, items] = await Promise.all([
      this.prisma.team.count(),
      this.prisma.team.findMany({
        skip: (page - 1) * take,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          _count: { select: { members: true, projects: true, servers: true } },
        },
      }),
    ]);

    return { total, page, limit: take, items };
  }

  async listSubscriptions() {
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

  async listUsersForTeam(teamId: string) {
    return this.prisma.teamMember.findMany({
      where: { teamId },
      select: {
        userId: true,
        joinedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            isActive: true,
          },
        },
      },
    });
  }
}
