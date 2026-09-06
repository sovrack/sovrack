import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { AccountDeletionService } from '../iam/authorization/account-deletion.service';
import { StaffAuditService } from './staff-audit.service';
import { type SafeUser, toSafeUser } from '../iam/users/user-safe-view';

/** Administration des comptes clients, séparée du cycle d'authentification staff. */
@Injectable()
export class StaffOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: StaffAuditService,
    private readonly config: ConfigService,
    private readonly accountDeletion: AccountDeletionService,
  ) {}

  async getOverview() {
    const [userAgg, activeUsers, teamsTotal, subs] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: { id: true } }),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.team.count(),
      this.prisma.subscription.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
    ]);
    const byRole = Object.fromEntries(
      userAgg.map((role) => [role.role, role._count.id]),
    );
    const byStatus = Object.fromEntries(
      subs.map((subscription) => [subscription.status, subscription._count.id]),
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
        total: userAgg.reduce((total, role) => total + role._count.id, 0),
        active: activeUsers,
        owners: byRole['OWNER'] ?? 0,
        members: byRole['MEMBER'] ?? 0,
      },
      teams: { total: teamsTotal },
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
    return { total, page, limit: take, items };
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

  async setUserActive(
    userId: string,
    isActive: boolean,
    actorId: string,
    ip?: string | null,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive,
        sessionVersion: { increment: 1 },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });
    await this.audit.record({
      staffId: actorId,
      action: isActive ? 'user.unblock' : 'user.block',
      resource: 'user',
      resourceId: userId,
      before: { isActive: user.isActive },
      after: { isActive },
      ip,
    });
    return {
      ...updated,
      message: isActive ? 'Compte réactivé' : 'Compte désactivé',
    };
  }

  async setUserRole(
    userId: string,
    role: Role,
    actorId: string,
    ip?: string | null,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (!Object.values(Role).includes(role)) {
      throw new BadRequestException('Rôle invalide');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });
    await this.audit.record({
      staffId: actorId,
      action: 'user.role.change',
      resource: 'user',
      resourceId: userId,
      before: { role: user.role },
      after: { role },
      ip,
    });
    return { ...updated, message: `Rôle défini sur ${role}` };
  }

  async updateUser(
    userId: string,
    dto: { role?: Role; isActive?: boolean },
    actorId: string,
    ip?: string | null,
  ) {
    const results: Promise<unknown>[] = [];
    if (dto.isActive !== undefined) {
      results.push(this.setUserActive(userId, dto.isActive, actorId, ip));
    }
    if (dto.role !== undefined) {
      results.push(this.setUserRole(userId, dto.role, actorId, ip));
    }
    if (results.length === 0) {
      return {
        message: 'Aucune modification fournie (role ou isActive attendu)',
      };
    }
    const [activeResult, roleResult] = await Promise.all(results);
    return { active: activeResult, role: roleResult };
  }

  async deleteUser(userId: string, actorId: string, ip?: string | null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    await this.accountDeletion.deleteIdentity(userId);
    await this.audit.record({
      staffId: actorId,
      action: 'user.delete',
      resource: 'user',
      resourceId: userId,
      after: { email: user.email },
      ip,
    });
    return { message: `Le compte ${user.email} a été supprimé définitivement` };
  }

  async impersonateUser(
    userId: string,
    actorStaffId: string,
    ip?: string | null,
  ): Promise<{ access_token: string; user: SafeUser }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (!user.isActive) {
      throw new BadRequestException('Le compte cible est désactivé');
    }
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      sub: user.id,
      authType: 'staff-impersonation' as const,
      impersonatedByStaffId: actorStaffId,
      sessionVersion: user.sessionVersion,
    };
    const customerSecret = this.config.get<string>('JWT_SECRET');
    if (!customerSecret) throw new Error('JWT_SECRET non configuré');
    const token = this.jwtService.sign(payload, {
      secret: customerSecret,
      expiresIn: '15m',
    });
    await this.audit.record({
      staffId: actorStaffId,
      action: 'user.impersonate',
      resource: 'user',
      resourceId: userId,
      after: { email: user.email },
      ip,
    });
    return { access_token: token, user: toSafeUser(user) };
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
}
