import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';

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
    if (!secret) {
      throw new Error(
        "JWT_SECRET non configuré dans les variables d'environnement",
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
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
