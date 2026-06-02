import { Role } from '@prisma/client';

/**
 * JWT payload shape used across HTTP controllers and gateways.
 */
export interface JwtPayloadDto {
  id: string;
  email: string;
  role: Role;
  sub?: string;
  iat?: number;
  exp?: number;
}

export type JwtPayload = JwtPayloadDto;
