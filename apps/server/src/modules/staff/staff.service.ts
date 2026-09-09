import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PlatformRole, Role, StaffStatus, type Staff } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { PasswordHasher } from '../iam/security/password-hasher.service';
import { StaffAuditService } from './staff-audit.service';
import { StaffJwtPayload } from './staff-jwt.strategy';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import {
  AcceptStaffInvitationDto,
  CreateStaffDto,
  StaffLoginDto,
  StaffUpdateUserDto,
} from './dto/staff.dto';
import { StaffOperationsService } from './staff-operations.service';
import { StaffInvitationService } from './staff-invitation.service';
import { type SafeStaff, toSafeStaff } from './staff-safe-view';
import { StaffMfaService } from './staff-mfa.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ms = require('ms') as (value: string) => number;

export type { SafeStaff } from './staff-safe-view';

export interface StaffAuthResponse {
  access_token: string;
  staff: SafeStaff;
  mfaEnrollmentRequired: boolean;
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
    private readonly invitations: StaffInvitationService,
    private readonly mfa: StaffMfaService,
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

    try {
      await this.mfa.verifyLoginSecondFactor(staff, dto.mfaCode);
    } catch (error: unknown) {
      await this.audit.record({
        staffId: staff.id,
        action: 'staff.login.mfa_failed',
        resource: 'staff',
        resourceId: staff.id,
        ip,
      });
      throw error;
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
      mfaVerified: updated.mfaEnabled || !this.mfa.isRequired(updated.role),
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

    return {
      access_token: token,
      staff: toSafeStaff(updated),
      mfaEnrollmentRequired:
        !updated.mfaEnabled && this.mfa.isRequired(updated.role),
    };
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
    return this.invitations.createStaff(dto, actorId, ip);
  }

  async resendStaffInvitation(
    staffId: string,
    actorId: string,
    ip?: string | null,
  ): Promise<{ message: string }> {
    return this.invitations.resend(staffId, actorId, ip);
  }

  async requestStaffActivationCode(
    email: string,
    ip?: string | null,
  ): Promise<{ message: string }> {
    return this.invitations.requestCode(email, ip);
  }

  async acceptStaffInvitation(
    dto: AcceptStaffInvitationDto,
    ip?: string | null,
  ): Promise<{ message: string }> {
    return this.invitations.accept(dto, ip);
  }

  async updateStaff(
    staffId: string,
    body: {
      role?: Exclude<PlatformRole, 'ROOT'>;
      status?: 'ACTIVE' | 'DISABLED' | 'BLOCKED';
      fullName?: string;
    },
    actorId: string,
    ip?: string | null,
  ) {
    if ((body as { role?: PlatformRole }).role === PlatformRole.ROOT) {
      throw new BadRequestException(
        'Le rôle ROOT est réservé au bootstrap initial et n’est pas délégable',
      );
    }
    const data: Partial<Pick<Staff, 'role' | 'status' | 'fullName'>> = {};
    if (body.role !== undefined) data.role = body.role;
    if (body.fullName !== undefined) data.fullName = body.fullName;
    if (body.status !== undefined) data.status = body.status;
    const revokesSessions =
      body.role !== undefined || body.status !== undefined;

    const { existing, updated } = await this.prisma.$transaction(
      async (transaction) => {
        const current = await transaction.staff.findUnique({
          where: { id: staffId },
        });
        if (!current) {
          throw new NotFoundException('Compte staff introuvable');
        }
        if (current.role === PlatformRole.ROOT && body.role !== undefined) {
          throw new BadRequestException(
            'Le rôle ROOT est immuable et réservé au bootstrap initial',
          );
        }
        if (Object.keys(data).length === 0) {
          return { existing: current, updated: current };
        }

        const removesActiveRoot =
          current.role === PlatformRole.ROOT &&
          current.status === 'ACTIVE' &&
          body.status !== undefined &&
          body.status !== 'ACTIVE';
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
          body.status !== undefined &&
          body.status !== 'ACTIVE'
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

  /** Impersonation : autorisation éphémère échangée sur le domaine client. */
  async impersonateUser(
    userId: string,
    actorStaffId: string,
    reason: string,
    ip?: string | null,
  ): ReturnType<StaffOperationsService['createImpersonationGrant']> {
    return this.operations.createImpersonationGrant(
      userId,
      actorStaffId,
      reason,
      ip,
    );
  }

  exchangeImpersonationGrant(token: string, ip?: string | null) {
    return this.operations.exchangeImpersonationGrant(token, ip);
  }

  async listAudit(pagination?: { page?: number; limit?: number }) {
    return this.operations.listAudit(pagination);
  }
}
