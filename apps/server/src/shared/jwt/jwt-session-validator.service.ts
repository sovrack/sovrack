import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { JwtPayloadDto } from './dto/jwt-payload.dto';

/**
 * Validates the server-side state behind a customer JWT.
 *
 * Signature and expiration checks alone are not enough: account suspension,
 * session revocation, email-verification changes and ended support sessions
 * must be applied consistently to HTTP and WebSocket transports.
 */
@Injectable()
export class JwtSessionValidator {
  constructor(private readonly prisma: PrismaService) {}

  async validate(payload: JwtPayloadDto): Promise<JwtPayloadDto> {
    if (!payload.id || !payload.email) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        email: true,
        isActive: true,
        emailVerifiedAt: true,
        provider: true,
        sessionVersion: true,
        legacyStaffRetiredAt: true,
      },
    });
    if (
      !user ||
      !user.isActive ||
      user.email !== payload.email ||
      !Number.isInteger(payload.sessionVersion) ||
      user.sessionVersion !== payload.sessionVersion ||
      Boolean(user.legacyStaffRetiredAt) ||
      (user.provider === 'email' && !user.emailVerifiedAt)
    ) {
      throw new UnauthorizedException('Session utilisateur révoquée');
    }

    if (payload.authType === 'staff-impersonation') {
      if (!payload.impersonationGrantId || !payload.impersonatedByStaffId) {
        throw new UnauthorizedException("Session d'assistance invalide");
      }
      const grant = await this.prisma.staffImpersonationGrant.findUnique({
        where: { id: payload.impersonationGrantId },
        select: {
          userId: true,
          staffId: true,
          consumedAt: true,
          sessionExpiresAt: true,
          endedAt: true,
        },
      });
      if (
        !grant ||
        grant.userId !== payload.id ||
        grant.staffId !== payload.impersonatedByStaffId ||
        !grant.consumedAt ||
        !grant.sessionExpiresAt ||
        grant.sessionExpiresAt.getTime() <= Date.now() ||
        grant.endedAt
      ) {
        throw new UnauthorizedException("Session d'assistance terminée");
      }
    }

    // The historical global User.role is never an authorization source. Keep
    // MEMBER in the compatibility payload until the field is removed from the
    // public contract; workspace/project memberships remain authoritative.
    return { ...payload, role: Role.MEMBER };
  }
}
