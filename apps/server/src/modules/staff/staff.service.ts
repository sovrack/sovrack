import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PlatformRole, Role, type Staff, type User } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { PasswordHasher } from '../iam/security/password-hasher.service';
import { StaffAuditService } from './staff-audit.service';
import { StaffJwtPayload } from './staff-jwt.strategy';
import { ConfigService } from '@nestjs/config';
import { AccountDeletionService } from '../iam/authorization/account-deletion.service';
import {
  CreateStaffDto,
  StaffLoginDto,
  StaffUpdateUserDto,
} from './dto/staff.dto';

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
    private readonly accountDeletion: AccountDeletionService,
  ) {}

  // ──────────────────────────── AUTH ────────────────────────────

  async login(
    dto: StaffLoginDto,
    ip?: string | null,
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

    const payload: StaffJwtPayload = {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      sub: updated.id,
    };
    const token = this.jwtService.sign(payload);

    await this.audit.record({
      staffId: updated.id,
      action: 'staff.login',
      resource: 'staff',
      resourceId: updated.id,
      ip,
    });

    return { access_token: token, staff: toSafeStaff(updated) };
  }

  async logout(staffId: string, ip?: string | null) {
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
    const created = await this.prisma.staff.create({
      data: {
        email: dto.email.toLowerCase(),
        password: await this.passwordHasher.hash(dto.password),
        fullName: dto.fullName,
        role: dto.role ?? PlatformRole.OPERATOR,
        createdBy: actorId,
      },
    });
    await this.audit.record({
      staffId: actorId,
      action: 'staff.create',
      resource: 'staff',
      resourceId: created.id,
      after: { email: created.email, role: created.role },
      ip,
    });
    return toSafeStaff(created);
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
    const existing = await this.prisma.staff.findUnique({
      where: { id: staffId },
    });
    if (!existing) {
      throw new NotFoundException('Compte staff introuvable');
    }
    const data: Partial<
      Pick<Staff, 'role' | 'status' | 'fullName' | 'password'>
    > = {};
    if (body.role !== undefined) data.role = body.role;
    if (body.fullName !== undefined) data.fullName = body.fullName;
    if (body.status !== undefined) data.status = body.status;
    if (body.password)
      data.password = await this.passwordHasher.hash(body.password);

    if (Object.keys(data).length === 0) {
      return toSafeStaff(existing);
    }

    const updated = await this.prisma.staff.update({
      where: { id: staffId },
      data,
    });
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
        total: userAgg.reduce((a, r) => a + r._count.id, 0),
        active: activeUsers,
        owners: byRole['OWNER'] ?? 0,
        members: byRole['MEMBER'] ?? 0,
      },
      teams: { total: teamsTotal },
      subscriptions: {
        total: subs.reduce((a, s) => a + s._count.id, 0),
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
      data: { isActive },
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
    dto: StaffUpdateUserDto,
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

  /** Impersonation : JWT client temporaire, journalisé en audit back-office. */
  async impersonateUser(
    userId: string,
    actorStaffId: string,
    ip?: string | null,
  ): Promise<{ access_token: string; user: Omit<User, 'password'> }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (!user.isActive) {
      throw new BadRequestException('Le compte cible est désactivé');
    }
    const payload: { id: string; email: string; role: Role; sub: string } = {
      id: user.id,
      email: user.email,
      role: user.role,
      sub: user.id,
    };
    const customerSecret = this.config.get<string>('JWT_SECRET');
    if (!customerSecret) {
      throw new Error('JWT_SECRET non configuré');
    }
    const token = this.jwtService.sign(payload, {
      secret: customerSecret,
      expiresIn: '15m',
    });
    const { password: _p, ...safeUser } = user;
    void _p;
    await this.audit.record({
      staffId: actorStaffId,
      action: 'user.impersonate',
      resource: 'user',
      resourceId: userId,
      after: { email: user.email },
      ip,
    });
    return { access_token: token, user: safeUser };
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
