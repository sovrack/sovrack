import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformRole, StaffStatus, type Staff } from '@prisma/client';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../shared/database/prisma.service';
import { PasswordHasher } from '../iam/security/password-hasher.service';
import { NotificationsSmtpService } from '../notifications/notifications-smtp.service';
import { AcceptStaffInvitationDto, CreateStaffDto } from './dto/staff.dto';
import { StaffAuditService } from './staff-audit.service';
import { escapeHtml } from './staff-invitation.utils';
import { toSafeStaff } from './staff-safe-view';

@Injectable()
export class StaffInvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
    private readonly audit: StaffAuditService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsSmtpService,
  ) {}

  async createStaff(dto: CreateStaffDto, actorId: string, ip?: string | null) {
    if ((dto as { role?: PlatformRole }).role === PlatformRole.ROOT) {
      throw new BadRequestException(
        'Le rôle ROOT est réservé au bootstrap initial et n’est pas délégable',
      );
    }
    const exists = await this.prisma.staff.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (exists) throw new BadRequestException('Cet email staff existe déjà');

    const unusablePassword = await this.passwordHasher.hash(
      randomBytes(48).toString('base64url'),
    );
    const provisioned = await this.prisma.$transaction(async (transaction) => {
      const staff = await transaction.staff.create({
        data: {
          email: dto.email.toLowerCase(),
          password: unusablePassword,
          fullName: dto.fullName,
          role: dto.role ?? PlatformRole.OPERATOR,
          status: StaffStatus.INVITED,
          createdBy: actorId,
        },
      });
      const { code, codeHash } = this.createActivationCode(staff.id);
      const invitation = await transaction.staffInvitation.create({
        data: {
          staffId: staff.id,
          tokenHash: codeHash,
          requestedIp: ip || null,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });
      return { staff, invitationId: invitation.id, code };
    });
    await this.deliverActivationCode(
      provisioned.staff,
      provisioned.invitationId,
      provisioned.code,
      actorId,
      ip,
    );
    await this.audit.record({
      staffId: actorId,
      action: 'staff.invite',
      resource: 'staff',
      resourceId: provisioned.staff.id,
      after: { email: provisioned.staff.email, role: provisioned.staff.role },
      ip,
    });
    return toSafeStaff(provisioned.staff);
  }

  async resend(
    staffId: string,
    actorId: string,
    ip?: string | null,
  ): Promise<{ message: string }> {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
    });
    if (!staff || staff.deletedAt) {
      throw new NotFoundException('Compte staff introuvable');
    }
    if (staff.status !== StaffStatus.INVITED) {
      throw new BadRequestException(
        "Seul un compte en attente d'invitation peut recevoir un nouveau code",
      );
    }

    const invitation = await this.issueCode(staff.id, ip);
    await this.deliverActivationCode(
      staff,
      invitation.id,
      invitation.code,
      actorId,
      ip,
    );
    await this.audit.record({
      staffId: actorId,
      action: 'staff.invitation.resend',
      resource: 'staff',
      resourceId: staff.id,
      after: { email: staff.email },
      ip,
    });
    return { message: "Code d'activation staff renvoyé" };
  }

  async requestCode(
    email: string,
    ip?: string | null,
  ): Promise<{ message: string }> {
    const genericMessage =
      'Si ce compte staff existe et attend son activation, un code a été envoyé.';
    const staff = await this.prisma.staff.findUnique({
      where: { email: email.toLowerCase() },
      include: { invitation: true },
    });
    if (!staff || staff.deletedAt || staff.status !== StaffStatus.INVITED) {
      return { message: genericMessage };
    }
    if (
      staff.invitation?.deliveredAt &&
      staff.invitation.updatedAt.getTime() > Date.now() - 60_000
    ) {
      return { message: genericMessage };
    }

    const invitation = await this.issueCode(staff.id, ip);
    try {
      await this.deliverActivationCode(
        staff,
        invitation.id,
        invitation.code,
        staff.id,
        ip,
      );
      await this.audit.record({
        staffId: staff.id,
        action: 'staff.invitation.resend',
        resource: 'staff',
        resourceId: staff.id,
        after: { selfService: true },
        ip,
      });
    } catch {
      // Réponse neutre : ni l'existence du compte ni l'état SMTP ne fuitent.
    }
    return { message: genericMessage };
  }

  async accept(
    dto: AcceptStaffInvitationDto,
    ip?: string | null,
  ): Promise<{ message: string }> {
    const invalidMessage = 'Invitation staff invalide ou expirée';
    const staff = await this.prisma.staff.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { invitation: true },
    });
    const invitation = staff?.invitation;
    if (
      !staff ||
      !invitation ||
      invitation.usedAt ||
      !invitation.deliveredAt ||
      invitation.expiresAt <= new Date() ||
      invitation.attempts >= 5 ||
      staff.deletedAt ||
      staff.status !== StaffStatus.INVITED
    ) {
      throw new BadRequestException(invalidMessage);
    }

    const expected = Buffer.from(invitation.tokenHash, 'hex');
    const actual = Buffer.from(
      this.hashActivationCode(staff.id, dto.code),
      'hex',
    );
    const matches =
      expected.length === actual.length && timingSafeEqual(expected, actual);
    if (!matches) {
      const nextAttempts = invitation.attempts + 1;
      await this.prisma.staffInvitation.updateMany({
        where: { id: invitation.id, usedAt: null },
        data: {
          attempts: { increment: 1 },
          ...(nextAttempts >= 5 ? { usedAt: new Date() } : {}),
        },
      });
      throw new BadRequestException(invalidMessage);
    }

    const password = await this.passwordHasher.hash(dto.password);
    const completedAt = new Date();
    const activated = await this.prisma.$transaction(
      async (transaction) => {
        const consumed = await transaction.staffInvitation.updateMany({
          where: {
            id: invitation.id,
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
        const updated = await transaction.staff.update({
          where: { id: invitation.staffId },
          data: { password, status: StaffStatus.ACTIVE },
        });
        await transaction.staffSession.updateMany({
          where: { staffId: updated.id, revokedAt: null },
          data: { revokedAt: completedAt },
        });
        return updated;
      },
      { isolationLevel: 'Serializable' },
    );
    await this.audit.record({
      staffId: activated.id,
      action: 'staff.invitation.accept',
      resource: 'staff',
      resourceId: activated.id,
      after: { email: activated.email, role: activated.role },
      ip,
    });
    return {
      message: 'Invitation acceptée. Vous pouvez maintenant vous connecter.',
    };
  }

  private async issueCode(staffId: string, ip?: string | null) {
    const { code, codeHash } = this.createActivationCode(staffId);
    const record = await this.prisma.staffInvitation.upsert({
      where: { staffId },
      create: {
        staffId,
        tokenHash: codeHash,
        requestedIp: ip || null,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
      update: {
        tokenHash: codeHash,
        attempts: 0,
        requestedIp: ip || null,
        deliveredAt: null,
        usedAt: null,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    return { id: record.id, code };
  }

  private createActivationCode(staffId: string) {
    const code = randomInt(0, 100_000_000).toString().padStart(8, '0');
    return { code, codeHash: this.hashActivationCode(staffId, code) };
  }

  private hashActivationCode(staffId: string, code: string): string {
    const secret = this.config.getOrThrow<string>('STAFF_OTP_SECRET');
    return createHmac('sha256', secret)
      .update(`staff-activation-v1\u0000${staffId}\u0000${code}`)
      .digest('hex');
  }

  private async deliverActivationCode(
    staff: Staff,
    invitationId: string,
    code: string,
    actorId: string,
    ip?: string | null,
  ): Promise<void> {
    const frontendUrl = this.config
      .get<string>('FRONTEND_URL', 'http://localhost:3000')
      .replace(/\/$/, '');
    const activationUrl = `${frontendUrl}/staff/activate?email=${encodeURIComponent(staff.email)}`;
    try {
      await this.notifications.sendTransactionalEmail(
        staff.email,
        "Code d'activation du back-office",
        `<p>Bonjour ${escapeHtml(staff.fullName)},</p>` +
          '<p>Un compte back-office Sovrack a été créé pour vous.</p>' +
          `<p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>` +
          '<p>Ce code expire dans 10 minutes et ne peut être utilisé qu’une seule fois.</p>' +
          `<p><a href="${escapeHtml(activationUrl)}">Choisir mon premier mot de passe</a></p>`,
      );
      await this.prisma.staffInvitation.updateMany({
        where: { id: invitationId, usedAt: null },
        data: { deliveredAt: new Date() },
      });
    } catch (error: unknown) {
      await this.prisma.staffInvitation.updateMany({
        where: { id: invitationId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await this.audit.record({
        staffId: actorId,
        action: 'staff.invitation.delivery_failed',
        resource: 'staff',
        resourceId: staff.id,
        ip,
      });
      throw error;
    }
  }
}
