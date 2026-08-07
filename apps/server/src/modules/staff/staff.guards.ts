import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { PrismaService } from '../../shared/database/prisma.service';
import type { PlatformRole } from '@prisma/client';
import type { StaffJwtPayload } from './staff-jwt.strategy';

export const STAFF_ROLES_KEY = 'staff_roles';

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
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      'staff_is_public',
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
    const staff = await this.prisma.staff.findUnique({
      where: { id: payload.id },
      select: { status: true, deletedAt: true },
    });
    if (!staff || staff.deletedAt || staff.status !== 'ACTIVE') {
      throw new ForbiddenException('Compte staff désactivé ou révoqué');
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
