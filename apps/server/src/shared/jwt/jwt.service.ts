import { Injectable } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { JwtPayloadDto } from './dto/jwt-payload.dto';

/**
 * Wrapper around NestJS JwtService for consistent token generation/validation.
 */
@Injectable()
export class JwtService {
  constructor(
    private jwtService: NestJwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Generate access token for user.
   */
  generateAccessToken(payload: JwtPayloadDto): string {
    return this.jwtService.sign(payload);
  }

  /**
   * Verify and decode token.
   */
  verifyToken(token: string): JwtPayloadDto {
    return this.jwtService.verify(token);
  }

  /**
   * Decode without verification (for debugging).
   */
  decodeToken(token: string): JwtPayloadDto {
    return this.jwtService.decode(token);
  }
}
