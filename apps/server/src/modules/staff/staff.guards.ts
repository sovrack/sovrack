import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { PrismaService } from '../../shared/database/prisma.service';
import type { PlatformRole } from '@prisma/client';
import type { StaffJwtPayload } from './staff-jwt.strategy';
import { ConfigService } from '@nestjs/config';

export const STAFF_ROLES_KEY = 'staff_roles';
export const STAFF_IS_PUBLIC_KEY = 'staff_is_public';
export const STAFF_MFA_ENROLLMENT_ALLOWED_KEY = 'staff_mfa_enrollment_allowed';

/** Exempts only the staff guard (the global customer guard uses @Public). */
export const StaffPublic = () => SetMetadata(STAFF_IS_PUBLIC_KEY, true);

/** Autorise une session staff limitée à consulter/configurer sa MFA. */
export const StaffMfaEnrollmentAllowed = () =>
  SetMetadata(STAFF_MFA_ENROLLMENT_ALLOWED_KEY, true);

/** Définit les rôles staff autorisés sur une route back-office. */
export const StaffRoles = (...roles: PlatformRole[]) =>
  SetMetadata(STAFF_ROLES_KEY, roles);

/**
 * Guard JWT du back-office : valide le token staff (cookie séparé) PUIS
 * vérifie en base que le compte est toujours ACTIVE (révocation immédiate).
 */
@Injectable()
export class StaffJwtAuthGuard extends AuthGuard('staff-jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      STAFF_IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const result = (await super.canActivate(context)) as boolean;
    if (!result) return false;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: StaffJwtPayload }>();
    const payload = request.user;
    if (!payload) return false;

    // Vérifie en base (pas seulement dans le token) : compte désactivé →
    // accès refusé immédiatement, même si le JWT n'a pas expiré.
    const [staff, session] = await Promise.all([
      this.prisma.staff.findUnique({
        where: { id: payload.id },
        select: {
          email: true,
          role: true,
          status: true,
          deletedAt: true,
          mfaEnabled: true,
        },
      }),
      this.prisma.staffSession.findFirst({
        where: {
          id: payload.sid,
          staffId: payload.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      }),
    ]);
    if (!staff || staff.deletedAt || staff.status !== 'ACTIVE') {
      throw new UnauthorizedException('Compte staff désactivé ou révoqué');
    }
    if (!session) {
      throw new UnauthorizedException('Session staff expirée ou révoquée');
    }
    // Le rôle porté par le JWT est seulement une photographie au login. La
    // base reste la source d'autorité afin qu'une rétrogradation prenne effet
    // dès la requête suivante, sans attendre l'expiration du token.
    payload.email = staff.email;
    payload.role = staff.role;

    const requiredRoles = this.config
      .get<string>('STAFF_MFA_REQUIRED_ROLES', 'ROOT,ADMIN')
      .split(',')
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean);
    const enrollmentAllowed = this.reflector.getAllAndOverride<boolean>(
      STAFF_MFA_ENROLLMENT_ALLOWED_KEY,
      [context.getHandler(), context.getClass()],
    );
    const secondFactorRequired =
      staff.mfaEnabled || requiredRoles.includes(staff.role);
    if (
      secondFactorRequired &&
      (!staff.mfaEnabled || payload.mfaVerified !== true) &&
      !enrollmentAllowed
    ) {
      throw new ForbiddenException({
        code: 'STAFF_MFA_ENROLLMENT_REQUIRED',
        message:
          "La configuration MFA est obligatoire avant d'utiliser le back-office",
      });
    }
    return true;
  }
}

/** Vérifie que le rôle staff requis est respecté (RBAC). */
@Injectable()
export class StaffRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PlatformRole[]>(
      STAFF_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: StaffJwtPayload }>();
    const user = request.user;
    if (!user?.role || !required.includes(user.role)) {
      throw new ForbiddenException(
        'Accès refusé : rôle back-office insuffisant',
      );
    }
    return true;
  }
}
