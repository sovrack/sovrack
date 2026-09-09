import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';

/** Handles the lifecycle edge that belongs to an impersonated client cookie. */
@Injectable()
export class ImpersonationSessionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ends only the support session. The customer's sessionVersion must remain
   * unchanged, otherwise legitimate customer sessions would also be revoked.
   */
  async logout(input: {
    userId: string;
    staffId: string;
    grantId: string;
  }): Promise<{ message: string }> {
    await this.prisma.$transaction(async (transaction) => {
      const ended = await transaction.staffImpersonationGrant.updateMany({
        where: {
          id: input.grantId,
          userId: input.userId,
          staffId: input.staffId,
          consumedAt: { not: null },
          endedAt: null,
        },
        data: { endedAt: new Date() },
      });
      if (ended.count !== 1) {
        throw new UnauthorizedException("Session d'assistance invalide");
      }
      await transaction.staffAuditLog.create({
        data: {
          staffId: input.staffId,
          action: 'user.impersonation.logout',
          resource: 'user',
          resourceId: input.userId,
          afterJson: { grantId: input.grantId },
        },
      });
    });
    return { message: "Session d'assistance terminée" };
  }
}
