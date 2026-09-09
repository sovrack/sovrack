import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
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
    const clientFilter = { legacyStaffRetiredAt: null } as const;
    const [userAgg, activeUsers, teamsTotal, subs] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['role'],
        where: clientFilter,
        _count: { id: true },
      }),
      this.prisma.user.count({
        where: { ...clientFilter, isActive: true },
      }),
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
      where: clientFilter,
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
      this.prisma.user.count({
        where: { legacyStaffRetiredAt: null },
      }),
      this.prisma.user.findMany({
        where: { legacyStaffRetiredAt: null },
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
          teams: {
            where: { status: 'ACTIVE' },
            select: {
              role: true,
              team: { select: { id: true, name: true, type: true } },
            },
          },
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
          type: true,
          status: true,
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
    const user = await this.findClientUser(userId);
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
    const user = await this.findClientUser(userId);
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
    dto: { isActive?: boolean },
    actorId: string,
    ip?: string | null,
  ) {
    const results: Promise<unknown>[] = [];
    if (dto.isActive !== undefined) {
      results.push(this.setUserActive(userId, dto.isActive, actorId, ip));
    }
    if (results.length === 0) {
      return {
        message: 'Aucune modification fournie (isActive attendu)',
      };
    }
    const [activeResult] = await Promise.all(results);
    return { active: activeResult };
  }

  async deleteUser(userId: string, actorId: string, ip?: string | null) {
    const user = await this.findClientUser(userId);
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

  async createImpersonationGrant(
    userId: string,
    actorStaffId: string,
    reason: string,
    ip?: string | null,
  ): Promise<{
    redirectUrl: string;
    expiresInSeconds: number;
    user: SafeUser;
  }> {
    const user = await this.findClientUser(userId);
    if (!user.isActive) {
      throw new BadRequestException('Le compte cible est désactivé');
    }
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 10 || normalizedReason.length > 500) {
      throw new BadRequestException(
        "Le motif d'assistance doit contenir entre 10 et 500 caractères",
      );
    }
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashImpersonationToken(token);
    const expiresInSeconds = 60;
    await this.prisma.staffImpersonationGrant.create({
      data: {
        tokenHash,
        userId,
        staffId: actorStaffId,
        reason: normalizedReason,
        requestedIp: ip,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      },
    });
    await this.audit.record({
      staffId: actorStaffId,
      action: 'user.impersonate',
      resource: 'user',
      resourceId: userId,
      after: { email: user.email, reason: normalizedReason },
      ip,
    });
    const customerAppUrl = this.config
      .get<string>(
        'CUSTOMER_APP_URL',
        this.config.get<string>('FRONTEND_URL', 'http://localhost:3000'),
      )
      .replace(/\/+$/, '');
    return {
      redirectUrl: `${customerAppUrl}/staff-session-exchange#token=${encodeURIComponent(token)}`,
      expiresInSeconds,
      user: toSafeUser(user),
    };
  }

  async exchangeImpersonationGrant(
    token: string,
    ip?: string | null,
  ): Promise<{
    access_token: string;
    user: SafeUser;
    expiresInSeconds: number;
  }> {
    const tokenHash = this.hashImpersonationToken(token);
    const customerSecret = this.config.get<string>('JWT_SECRET');
    if (!customerSecret) throw new Error('JWT_SECRET non configuré');
    const expiresInSeconds = 15 * 60;
    const sessionExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const exchanged = await this.prisma.$transaction(async (tx) => {
      const grant = await tx.staffImpersonationGrant.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (
        !grant ||
        grant.consumedAt ||
        grant.expiresAt.getTime() <= Date.now() ||
        !grant.user.isActive ||
        grant.user.legacyStaffRetiredAt
      ) {
        throw new UnauthorizedException(
          "L'autorisation d'assistance est invalide ou expirée",
        );
      }
      const consumed = await tx.staffImpersonationGrant.updateMany({
        where: {
          id: grant.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date(), sessionExpiresAt },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException(
          "L'autorisation d'assistance a déjà été utilisée",
        );
      }
      await tx.staffAuditLog.create({
        data: {
          staffId: grant.staffId,
          action: 'user.impersonation.exchange',
          resource: 'user',
          resourceId: grant.user.id,
          afterJson: {
            grantId: grant.id,
            reason: grant.reason,
            expiresInSeconds,
          },
          ip: ip ?? null,
        },
      });
      return {
        grantId: grant.id,
        staffId: grant.staffId,
        reason: grant.reason,
        user: grant.user,
      };
    });

    const accessToken = this.jwtService.sign(
      {
        id: exchanged.user.id,
        email: exchanged.user.email,
        role: exchanged.user.role,
        sub: exchanged.user.id,
        authType: 'staff-impersonation' as const,
        impersonatedByStaffId: exchanged.staffId,
        impersonationGrantId: exchanged.grantId,
        sessionVersion: exchanged.user.sessionVersion,
      },
      { secret: customerSecret, expiresIn: '15m' },
    );
    return {
      access_token: accessToken,
      user: toSafeUser(exchanged.user),
      expiresInSeconds,
    };
  }

  private hashImpersonationToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async findClientUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    // Retired pre-Staff identities remain only for referential integrity. Treat
    // them as absent on every customer operation, even with a historical ID.
    if (!user || user.legacyStaffRetiredAt) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return user;
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
