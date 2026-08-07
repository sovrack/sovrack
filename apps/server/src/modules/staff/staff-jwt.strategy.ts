import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { extractTokenFromCookieHeader } from '../../shared/http/auth-cookie.util';
import { resolveStaffAuthCookieName } from '../../shared/http/staff-auth-cookie.util';

export interface StaffJwtPayload {
  /** id du staff (Staff.id). */
  id: string;
  email: string;
  sub: string;
  role: import('@prisma/client').PlatformRole;
}

/**
 * Stratégie JWT DÉDIÉE au back-office / staff.
 * Utilise un cookie et un secret séparés de la plateforme client pour isoler
 * les deux systèmes d'identité (approche "auth planes").
 */
@Injectable()
export class StaffJwtStrategy extends PassportStrategy(Strategy, 'staff-jwt') {
  constructor(configService: ConfigService) {
    const staffSecret =
      configService.get<string>('STAFF_JWT_SECRET') ||
      configService.get<string>('JWT_SECRET');
    if (!staffSecret) {
      throw new Error('JWT_SECRET environment variable is not defined');
    }
    const cookieName = resolveStaffAuthCookieName(configService);

    const fromCookie = (request: Request): string | null => {
      return extractTokenFromCookieHeader(request?.headers?.cookie, cookieName);
    };

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: staffSecret,
    });
  }

  validate(payload: StaffJwtPayload): StaffJwtPayload {
    if (!payload.id || !payload.email || !payload.role) {
      throw new UnauthorizedException('Invalid staff token payload');
    }
    return payload;
  }
}
