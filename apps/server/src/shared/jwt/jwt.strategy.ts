import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { JwtPayloadDto } from './dto/jwt-payload.dto';
import type { Request } from 'express';
import { PrismaService } from '../database/prisma.service';
import {
  extractTokenFromCookieHeader,
  resolveAuthCookieName,
} from '../../shared/http/auth-cookie.util';

/**
 * JWT Passport Strategy — extracted from auth module.
 * Works with AppJwtModule for centralized configuration.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    const cookieName = resolveAuthCookieName(configService);
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is not defined');
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
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayloadDto): Promise<JwtPayloadDto> {
    if (!payload.id || !payload.email) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // A signed token is not sufficient proof that the identity is still
    // allowed to act: staff suspension/deletion and email-verification state
    // must take effect immediately, without waiting for JWT expiration.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        email: true,
        isActive: true,
        emailVerifiedAt: true,
        provider: true,
        sessionVersion: true,
      },
    });
    if (
      !user ||
      !user.isActive ||
      user.email !== payload.email ||
      !Number.isInteger(payload.sessionVersion) ||
      user.sessionVersion !== payload.sessionVersion ||
      (user.provider === 'email' && !user.emailVerifiedAt)
    ) {
      throw new UnauthorizedException('Session utilisateur révoquée');
    }
    return payload;
  }
}
