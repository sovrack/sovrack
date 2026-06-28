import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { JwtPayloadDto } from './dto/jwt-payload.dto';
import type { Request } from 'express';
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
  constructor(configService: ConfigService) {
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

  validate(payload: JwtPayloadDto): JwtPayloadDto {
    if (!payload.id || !payload.email) {
      throw new UnauthorizedException('Invalid token payload');
    }
    return payload;
  }
}
