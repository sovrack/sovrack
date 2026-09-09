import { Role } from '@prisma/client';

/**
 * JWT payload shape used across HTTP controllers and gateways.
 */
export interface JwtPayloadDto {
  id: string;
  email: string;
  role: Role;
  sessionVersion: number;
  authType?: 'user' | 'staff-impersonation';
  impersonatedByStaffId?: string;
  impersonationGrantId?: string;
  sub?: string;
  iat?: number;
  exp?: number;
}

export type JwtPayload = JwtPayloadDto;
