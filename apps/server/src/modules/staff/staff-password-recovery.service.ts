import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StaffStatus } from '@prisma/client';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../shared/database/prisma.service';
import { PasswordHasher } from '../iam/security/password-hasher.service';
import { NotificationsSmtpService } from '../notifications/notifications-smtp.service';
import { StaffForgotPasswordDto, StaffResetPasswordDto } from './dto/staff.dto';
import { StaffAuditService } from './staff-audit.service';
import { escapeHtml } from './staff-invitation.utils';

@Injectable()
export class StaffPasswordRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
    private readonly audit: StaffAuditService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsSmtpService,
  ) {}

  async forgotPassword(
    dto: StaffForgotPasswordDto,
    ip?: string | null,
  ): Promise<{ message: string }> {
    const genericMessage =
      'Si ce compte staff existe et est actif, un code de récupération a été envoyé.';
    const staff = await this.prisma.staff.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!staff || staff.deletedAt || staff.status !== StaffStatus.ACTIVE) {
      return { message: genericMessage };
    }

    const recentRequest = await this.prisma.staffPasswordReset.findFirst({
      where: {
        staffId: staff.id,
        createdAt: { gt: new Date(Date.now() - 60_000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recentRequest) return { message: genericMessage };

    const code = randomInt(0, 100_000_000).toString().padStart(8, '0');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    const reset = await this.prisma.$transaction(async (transaction) => {
      await transaction.staffPasswordReset.updateMany({
        where: { staffId: staff.id, usedAt: null },
        data: { usedAt: now },
      });
      return transaction.staffPasswordReset.create({
        data: {
          staffId: staff.id,
          codeHash: this.hashCode(staff.id, code),
          requestedIp: ip || null,
          expiresAt,
        },
      });
    });

    await this.audit.record({
      staffId: staff.id,
      action: 'staff.password.reset.requested',
      resource: 'staff',
      resourceId: staff.id,
      after: { resetId: reset.id, expiresAt },
      ip,
    });

    try {
      await this.notifications.sendTransactionalEmail(
        staff.email,
        'Code de récupération du back-office',
        `<p>Bonjour ${escapeHtml(staff.fullName)},</p>` +
          '<p>Une réinitialisation du mot de passe de votre compte Staff Sovrack a été demandée.</p>' +
          `<p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>` +
          '<p>Ce code expire dans 10 minutes et ne peut être utilisé qu’une seule fois.</p>' +
          '<p>Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.</p>',
      );
      await this.prisma.staffPasswordReset.updateMany({
        where: { id: reset.id, usedAt: null },
        data: { deliveredAt: new Date() },
      });
    } catch {
      await this.prisma.staffPasswordReset.updateMany({
        where: { id: reset.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await this.audit.record({
        staffId: staff.id,
        action: 'staff.password.reset.delivery_failed',
        resource: 'staff',
        resourceId: staff.id,
        after: { resetId: reset.id },
        ip,
      });
      // La réponse reste identique à celle d'un compte inconnu : un appelant
      // public ne doit pouvoir déduire ni l'existence du staff ni l'état SMTP.
    }

    return { message: genericMessage };
  }

  async resetPassword(
    dto: StaffResetPasswordDto,
    ip?: string | null,
  ): Promise<{ message: string }> {
    const invalidMessage = 'Code de récupération invalide ou expiré';
    const staff = await this.prisma.staff.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!staff || staff.deletedAt || staff.status !== StaffStatus.ACTIVE) {
      throw new BadRequestException(invalidMessage);
    }

    const reset = await this.prisma.staffPasswordReset.findFirst({
      where: {
        staffId: staff.id,
        usedAt: null,
        deliveredAt: { not: null },
        expiresAt: { gt: new Date() },
        attempts: { lt: 5 },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!reset) {
      throw new BadRequestException(invalidMessage);
    }

    const expected = Buffer.from(reset.codeHash, 'hex');
    const actual = Buffer.from(this.hashCode(staff.id, dto.code), 'hex');
    const matches =
      expected.length === actual.length && timingSafeEqual(expected, actual);
    if (!matches) {
      const nextAttempts = reset.attempts + 1;
      await this.prisma.staffPasswordReset.updateMany({
        where: { id: reset.id, usedAt: null },
        data: {
          attempts: { increment: 1 },
          ...(nextAttempts >= 5 ? { usedAt: new Date() } : {}),
        },
      });
      throw new BadRequestException(invalidMessage);
    }

    const password = await this.passwordHasher.hash(dto.password);
    const completedAt = new Date();
    await this.prisma.$transaction(
      async (transaction) => {
        const consumed = await transaction.staffPasswordReset.updateMany({
          where: {
            id: reset.id,
            usedAt: null,
            deliveredAt: { not: null },
            expiresAt: { gt: completedAt },
            attempts: { lt: 5 },
          },
          data: { usedAt: completedAt },
        });
        if (consumed.count !== 1) {
          throw new BadRequestException(invalidMessage);
        }
        await transaction.staff.update({
          where: { id: staff.id },
          data: { password },
        });
        await transaction.staffSession.updateMany({
          where: { staffId: staff.id, revokedAt: null },
          data: { revokedAt: completedAt },
        });
        await transaction.staffPasswordReset.updateMany({
          where: { staffId: staff.id, usedAt: null },
          data: { usedAt: completedAt },
        });
      },
      { isolationLevel: 'Serializable' },
    );

    await this.audit.record({
      staffId: staff.id,
      action: 'staff.password.reset.completed',
      resource: 'staff',
      resourceId: staff.id,
      after: { resetId: reset.id, sessionsRevoked: true },
      ip,
    });
    return { message: 'Mot de passe Staff réinitialisé avec succès' };
  }

  private hashCode(staffId: string, code: string): string {
    const secret = this.config.getOrThrow<string>('STAFF_OTP_SECRET');
    return createHmac('sha256', secret)
      .update(`staff-password-reset-v1\u0000${staffId}\u0000${code}`)
      .digest('hex');
  }
}
