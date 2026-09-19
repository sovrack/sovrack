import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WorkspaceStatus, WorkspaceType } from '@prisma/client';
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
        ...(isActive
          ? { deletionRequestedAt: null, deletionScheduledFor: null }
          : {}),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        deletionScheduledFor: true,
      },
    });
    if (isActive && user.deletionScheduledFor) {
      await this.prisma.team.updateMany({
        where: {
          personalOwnerId: userId,
          type: WorkspaceType.PERSONAL,
          status: WorkspaceStatus.DELETION_PENDING,
        },
        data: { status: WorkspaceStatus.ACTIVE },
      });
    }
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

  async scheduleUserDeletion(
    userId: string,
    actorId: string,
    reason: string,
    ip?: string | null,
  ) {
    const user = await this.findClientUser(userId);
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 10 || normalizedReason.length > 500) {
      throw new BadRequestException(
        'Le motif doit contenir entre 10 et 500 caractères',
      );
    }
    const deletion =
      await this.accountDeletion.scheduleIdentityDeletion(userId);
    await this.audit.record({
      staffId: actorId,
      action: 'user.deletion.schedule',
      resource: 'user',
      resourceId: userId,
      after: {
        email: user.email,
        reason: normalizedReason,
        scheduledFor: deletion.scheduledFor.toISOString(),
      },
      ip,
    });
    return {
      message: `Le compte ${user.email} est désactivé et sera supprimé après le délai de grâce`,
      scheduledFor: deletion.scheduledFor,
    };
  }

  async cancelUserDeletion(
    userId: string,
    actorId: string,
    ip?: string | null,
  ) {
    const restored = await this.accountDeletion.cancelIdentityDeletion(userId);
    await this.audit.record({
      staffId: actorId,
      action: 'user.deletion.cancel',
      resource: 'user',
      resourceId: userId,
      after: { email: restored.email },
      ip,
    });
    return { message: `Suppression annulée pour ${restored.email}` };
  }

  async revokeUserSessions(
    userId: string,
    actorId: string,
    ip?: string | null,
  ) {
    const user = await this.findClientUser(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });
    await this.prisma.staffImpersonationGrant.updateMany({
      where: { userId, endedAt: null },
      data: { endedAt: new Date() },
    });
    await this.audit.record({
      staffId: actorId,
      action: 'user.sessions.revoke',
      resource: 'user',
      resourceId: userId,
      after: { email: user.email },
      ip,
    });
    return { message: 'Toutes les sessions du compte ont été révoquées' };
  }

  async updateTeamStatus(
    teamId: string,
    status: WorkspaceStatus,
    actorId: string,
    ip?: string | null,
  ) {
    if (
      status !== WorkspaceStatus.ACTIVE &&
      status !== WorkspaceStatus.SUSPENDED &&
      status !== WorkspaceStatus.ARCHIVED
    ) {
      throw new BadRequestException('Statut de workspace non modifiable');
    }
    const existing = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true, status: true },
    });
    if (!existing) throw new NotFoundException('Workspace introuvable');
    const updated = await this.prisma.team.update({
      where: { id: teamId },
      data: { status },
      select: { id: true, name: true, type: true, status: true },
    });
    await this.audit.record({
      staffId: actorId,
      action: 'workspace.status.change',
      resource: 'workspace',
      resourceId: teamId,
      before: { status: existing.status },
      after: { status },
      ip,
    });
    return updated;
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
        role: 'MEMBER',
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
}
