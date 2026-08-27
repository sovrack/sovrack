import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  PlatformRole,
  Role,
  StaffStatus,
  type Staff,
  type User,
} from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { PasswordHasher } from '../iam/security/password-hasher.service';
import { StaffAuditService } from './staff-audit.service';
import { StaffJwtPayload } from './staff-jwt.strategy';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import {
  AcceptStaffInvitationDto,
  CreateStaffDto,
  StaffLoginDto,
  StaffUpdateUserDto,
} from './dto/staff.dto';
import { NotificationsSmtpService } from '../notifications/notifications-smtp.service';
import { StaffOperationsService } from './staff-operations.service';
import { escapeHtml } from './staff-invitation.utils';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ms = require('ms') as (value: string) => number;

export type SafeStaff = Omit<Staff, 'password' | 'mfaSecret'>;

export interface StaffAuthResponse {
  access_token: string;
  staff: SafeStaff;
}

function toSafeStaff(s: Staff): SafeStaff {
  const { password: _p, mfaSecret: _m, ...rest } = s;
  void _p;
  void _m;
  return rest;
}

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly passwordHasher: PasswordHasher,
    private readonly audit: StaffAuditService,
    private readonly config: ConfigService,
    private readonly operations: StaffOperationsService,
    private readonly notifications: NotificationsSmtpService,
  ) {}

  // ──────────────────────────── AUTH ────────────────────────────

  async login(
    dto: StaffLoginDto,
    ip?: string | null,
    userAgent?: string | null,
  ): Promise<StaffAuthResponse> {
    const staff = await this.prisma.staff.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!staff) {
      throw new UnauthorizedException('Identifiants back-office incorrects');
    }
    if (staff.deletedAt) {
      throw new UnauthorizedException('Compte staff supprimé');
    }
    if (staff.status !== 'ACTIVE') {
      if (staff.status === StaffStatus.INVITED) {
        throw new ForbiddenException(
          "Ce compte staff doit d'abord accepter son invitation",
        );
      }
      throw new ForbiddenException('Compte staff désactivé ou bloqué');
    }
    const ok = await this.passwordHasher.verify(staff.password, dto.password);
    if (!ok) {
      throw new UnauthorizedException('Identifiants back-office incorrects');
    }

    const updated = await this.prisma.staff.update({
      where: { id: staff.id },
      data: { lastLoginAt: new Date() },
    });

    const sessionId = randomUUID();
    const payload: StaffJwtPayload = {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      sub: updated.id,
      sid: sessionId,
    };
    const token = this.jwtService.sign(payload);
    const expiresIn = this.config.get<string>('STAFF_JWT_EXPIRES_IN', '12h');
    const expiresAt = new Date(Date.now() + ms(expiresIn));
    await this.prisma.staffSession.create({
      data: {
        id: sessionId,
        staffId: updated.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        ip: ip || null,
        userAgent: userAgent?.slice(0, 512) || null,
        expiresAt,
      },
    });

    await this.audit.record({
      staffId: updated.id,
      action: 'staff.login',
      resource: 'staff',
      resourceId: updated.id,
      ip,
    });

    return { access_token: token, staff: toSafeStaff(updated) };
  }

  async logout(staffId: string, sessionId: string, ip?: string | null) {
    await this.prisma.staffSession.updateMany({
      where: { id: sessionId, staffId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      staffId,
      action: 'staff.logout',
      resource: 'staff',
      resourceId: staffId,
      ip,
    });
    return { message: 'Déconnexion back-office enregistrée' };
  }

  async me(staffId: string): Promise<SafeStaff> {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
    });
    if (!staff) {
      throw new NotFoundException('Compte staff introuvable');
    }
    return toSafeStaff(staff);
  }

  // ──────────────────────── STAFF (back-office) ────────────────────────

  async listStaff(pagination?: { page?: number; limit?: number }) {
    const page = Math.max(1, Number(pagination?.page) || 1);
    const take = Math.min(100, Math.max(1, Number(pagination?.limit) || 50));
    const [total, items] = await Promise.all([
      this.prisma.staff.count({ where: { deletedAt: null } }),
      this.prisma.staff.findMany({
        where: { deletedAt: null },
        skip: (page - 1) * take,
        take,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { total, page, limit: take, items: items.map(toSafeStaff) };
  }

  async createStaff(dto: CreateStaffDto, actorId: string, ip?: string | null) {
    const exists = await this.prisma.staff.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (exists) {
      throw new BadRequestException('Cet email staff existe déjà');
    }
    const { token, tokenHash } = this.createInvitationToken();
    const unusablePassword = await this.passwordHasher.hash(
      randomBytes(48).toString('base64url'),
    );
    const created = await this.prisma.$transaction(async (transaction) => {
      const staff = await transaction.staff.create({
        data: {
          email: dto.email.toLowerCase(),
          password: unusablePassword,
          fullName: dto.fullName,
          role: dto.role ?? PlatformRole.OPERATOR,
          status: StaffStatus.INVITED,
          createdBy: actorId,
        },
      });
      await transaction.staffInvitation.create({
        data: {
          staffId: staff.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      return staff;
    });
    await this.sendStaffInvitation(created, token);
    await this.audit.record({
      staffId: actorId,
      action: 'staff.invite',
      resource: 'staff',
      resourceId: created.id,
      after: { email: created.email, role: created.role },
      ip,
    });
    return toSafeStaff(created);
  }

  async resendStaffInvitation(
    staffId: string,
    actorId: string,
    ip?: string | null,
  ): Promise<{ message: string }> {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
    });
    if (!staff || staff.deletedAt) {
      throw new NotFoundException('Compte staff introuvable');
    }
    if (staff.status !== StaffStatus.INVITED) {
      throw new BadRequestException(
        "Seul un compte en attente d'invitation peut être renvoyé",
      );
    }

    const { token, tokenHash } = this.createInvitationToken();
    await this.prisma.staffInvitation.upsert({
      where: { staffId },
      create: {
        staffId,
        tokenHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      update: {
        tokenHash,
        usedAt: null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await this.sendStaffInvitation(staff, token);
    await this.audit.record({
      staffId: actorId,
      action: 'staff.invitation.resend',
      resource: 'staff',
      resourceId: staff.id,
      after: { email: staff.email },
      ip,
    });
    return { message: 'Invitation staff renvoyée' };
  }

  async acceptStaffInvitation(
    dto: AcceptStaffInvitationDto,
    ip?: string | null,
  ): Promise<{ message: string }> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const invitation = await this.prisma.staffInvitation.findUnique({
      where: { tokenHash },
      include: { staff: true },
    });
    if (
      !invitation ||
      invitation.usedAt ||
      invitation.expiresAt <= new Date() ||
      invitation.staff.deletedAt ||
      invitation.staff.status !== StaffStatus.INVITED
    ) {
      throw new BadRequestException('Invitation staff invalide ou expirée');
    }

    const password = await this.passwordHasher.hash(dto.password);
    const activated = await this.prisma.$transaction(
      async (transaction) => {
        const consumed = await transaction.staffInvitation.updateMany({
          where: {
            id: invitation.id,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { usedAt: new Date() },
        });
        if (consumed.count !== 1) {
          throw new BadRequestException('Invitation staff invalide ou expirée');
        }
        const staff = await transaction.staff.update({
          where: { id: invitation.staffId },
          data: { password, status: StaffStatus.ACTIVE },
        });
        await transaction.staffSession.updateMany({
          where: { staffId: staff.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return staff;
      },
      { isolationLevel: 'Serializable' },
    );
    await this.audit.record({
      staffId: activated.id,
      action: 'staff.invitation.accept',
      resource: 'staff',
      resourceId: activated.id,
      after: { email: activated.email, role: activated.role },
      ip,
    });
    return {
      message: 'Invitation acceptée. Vous pouvez maintenant vous connecter.',
    };
  }

  async updateStaff(
    staffId: string,
    body: {
      role?: PlatformRole;
      status?: 'ACTIVE' | 'DISABLED' | 'BLOCKED';
      fullName?: string;
      password?: string;
    },
    actorId: string,
    ip?: string | null,
  ) {
    const data: Partial<
      Pick<Staff, 'role' | 'status' | 'fullName' | 'password'>
    > = {};
    if (body.role !== undefined) data.role = body.role;
    if (body.fullName !== undefined) data.fullName = body.fullName;
    if (body.status !== undefined) data.status = body.status;
    if (body.password)
      data.password = await this.passwordHasher.hash(body.password);

    const revokesSessions =
      body.role !== undefined ||
      body.status !== undefined ||
      body.password !== undefined;

    const { existing, updated } = await this.prisma.$transaction(
      async (transaction) => {
        const current = await transaction.staff.findUnique({
          where: { id: staffId },
        });
        if (!current) {
          throw new NotFoundException('Compte staff introuvable');
        }
        if (Object.keys(data).length === 0) {
          return { existing: current, updated: current };
        }

        const removesActiveRoot =
          current.role === PlatformRole.ROOT &&
          current.status === 'ACTIVE' &&
          ((body.role !== undefined && body.role !== PlatformRole.ROOT) ||
            (body.status !== undefined && body.status !== 'ACTIVE'));
        if (removesActiveRoot) {
          const activeRoots = await transaction.staff.count({
            where: {
              role: PlatformRole.ROOT,
              status: 'ACTIVE',
              deletedAt: null,
            },
          });
          if (activeRoots <= 1) {
            throw new BadRequestException(
              'Impossible de désactiver ou rétrograder le dernier ROOT actif',
            );
          }
        }
        if (
          actorId === staffId &&
          ((body.role !== undefined && body.role !== PlatformRole.ROOT) ||
            (body.status !== undefined && body.status !== 'ACTIVE'))
        ) {
          throw new BadRequestException(
            'Un ROOT ne peut pas désactiver ou rétrograder sa propre session',
          );
        }

        const changed = await transaction.staff.update({
          where: { id: staffId },
          data,
        });
        if (revokesSessions) {
          await transaction.staffSession.updateMany({
            where: { staffId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        return { existing: current, updated: changed };
      },
      { isolationLevel: 'Serializable' },
    );
    await this.audit.record({
      staffId: actorId,
      action: 'staff.update',
      resource: 'staff',
      resourceId: staffId,
      before: { role: existing.role, status: existing.status },
      after: { role: updated.role, status: updated.status },
      ip,
    });
    return toSafeStaff(updated);
  }

  // ──────────────────────────── USERS (clients) ────────────────────────────

  async getOverview() {
    return this.operations.getOverview();
  }

  async listUsers(pagination?: { page?: number; limit?: number }) {
    return this.operations.listUsers(pagination);
  }

  async listTeams(pagination?: { page?: number; limit?: number }) {
    return this.operations.listTeams(pagination);
  }

  async listSubscriptions() {
    return this.operations.listSubscriptions();
  }

  async setUserActive(
    userId: string,
    isActive: boolean,
    actorId: string,
    ip?: string | null,
  ) {
    return this.operations.setUserActive(userId, isActive, actorId, ip);
  }

  async setUserRole(
    userId: string,
    role: Role,
    actorId: string,
    ip?: string | null,
  ) {
    return this.operations.setUserRole(userId, role, actorId, ip);
  }

  async updateUser(
    userId: string,
    dto: StaffUpdateUserDto,
    actorId: string,
    ip?: string | null,
  ) {
    return this.operations.updateUser(userId, dto, actorId, ip);
  }

  async deleteUser(userId: string, actorId: string, ip?: string | null) {
    return this.operations.deleteUser(userId, actorId, ip);
  }

  /** Impersonation : JWT client temporaire, journalisé en audit back-office. */
  async impersonateUser(
    userId: string,
    actorStaffId: string,
    ip?: string | null,
  ): Promise<{ access_token: string; user: Omit<User, 'password'> }> {
    return this.operations.impersonateUser(userId, actorStaffId, ip);
  }

  async listAudit(pagination?: { page?: number; limit?: number }) {
    return this.operations.listAudit(pagination);
  }

  private createInvitationToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString('base64url');
    return {
      token,
      tokenHash: createHash('sha256').update(token).digest('hex'),
    };
  }

  private async sendStaffInvitation(
    staff: Staff,
    token: string,
  ): Promise<void> {
    const frontendUrl = this.config
      .get<string>('FRONTEND_URL', 'http://localhost:3000')
      .replace(/\/$/, '');
    const activationUrl = `${frontendUrl}/staff/activate?token=${encodeURIComponent(token)}`;
    await this.notifications.sendTransactionalEmail(
      staff.email,
      'Invitation au back-office',
      `<p>Bonjour ${escapeHtml(staff.fullName)},</p>` +
        '<p>Un compte back-office Sovrack a été créé pour vous.</p>' +
        `<p><a href="${escapeHtml(activationUrl)}">Choisir mon mot de passe et activer le compte</a></p>` +
        '<p>Ce lien à usage unique expire dans 24 heures.</p>',
    );
  }
}
