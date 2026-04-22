import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import {
  extractTokenFromCookieHeader,
  resolveAuthCookieName,
} from '../../../common/auth/auth-cookie.util';

/**
 * Payload JWT contenant les informations de l'utilisateur
 */
export interface JwtPayload {
  id: string;
  email: string;
  role: Role;
}

/**
 * Stratégie JWT pour valider les tokens d'authentification
 * Extrait le token depuis le header Authorization Bearer
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    const secret = configService.get<string>('JWT_SECRET');
    const cookieName = resolveAuthCookieName(configService);
    if (!secret) {
      throw new Error(
        "JWT_SECRET non configuré dans les variables d'environnement",
      );
    }

    const fromCookie = (request: Request): string | null => {
      return extractTokenFromCookieHeader(request?.headers?.cookie, cookieName);
    };

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * Valide le payload du token JWT
   * @param payload - Payload décodé du token
   * @returns Payload validé
   */
  validate(payload: JwtPayload): JwtPayload {
    if (!payload.id || !payload.email) {
      throw new UnauthorizedException('Token invalide');
    }
    return { id: payload.id, email: payload.email, role: payload.role };
  }
}
