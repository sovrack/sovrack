import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformRole, StaffStatus, type Staff } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { CryptoService } from '../../shared/crypto/crypto.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { PasswordHasher } from '../iam/security/password-hasher.service';
import { StaffAuditService } from './staff-audit.service';

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type MfaStaff = Pick<
  Staff,
  'id' | 'email' | 'role' | 'status' | 'deletedAt' | 'mfaEnabled' | 'mfaSecret'
>;

export type StaffMfaStatus = {
  enabled: boolean;
  required: boolean;
  recoveryCodesRemaining: number;
};

@Injectable()
export class StaffMfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly passwordHasher: PasswordHasher,
    private readonly audit: StaffAuditService,
    private readonly config: ConfigService,
  ) {}

  isRequired(role: PlatformRole): boolean {
    const configured = this.config.get<string>(
      'STAFF_MFA_REQUIRED_ROLES',
      'ROOT,ADMIN',
    );
    return configured
      .split(',')
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean)
      .includes(role);
  }

  async status(staffId: string): Promise<StaffMfaStatus> {
    const staff = await this.getStaff(staffId);
    const recoveryCodesRemaining = staff.mfaEnabled
      ? await this.prisma.staffMfaRecoveryCode.count({
          where: { staffId, usedAt: null },
        })
      : 0;
    return {
      enabled: staff.mfaEnabled,
      required: this.isRequired(staff.role),
      recoveryCodesRemaining,
    };
  }

  async beginSetup(
    staffId: string,
    ip?: string | null,
  ): Promise<{ secret: string; otpauthUri: string }> {
    const staff = await this.getStaff(staffId);
    if (staff.mfaEnabled) {
      throw new BadRequestException(
        'La MFA est déjà active. Utilisez la procédure de remplacement.',
      );
    }

    const secret = this.base32Encode(randomBytes(20));
    await this.prisma.$transaction(async (transaction) => {
      await transaction.staff.update({
        where: { id: staff.id },
        data: {
          mfaSecret: this.crypto.encrypt(secret),
          mfaEnabled: false,
          mfaLastUsedStep: null,
        },
      });
      await transaction.staffMfaRecoveryCode.deleteMany({
        where: { staffId: staff.id },
      });
    });
    await this.audit.record({
      staffId: staff.id,
      action: 'staff.mfa.setup_started',
      resource: 'staff',
      resourceId: staff.id,
      ip,
    });
    return { secret, otpauthUri: this.buildOtpAuthUri(staff.email, secret) };
  }

  async enable(
    staffId: string,
    code: string,
    ip?: string | null,
  ): Promise<{ recoveryCodes: string[]; reauthenticationRequired: true }> {
    const staff = await this.getStaff(staffId);
    if (staff.mfaEnabled || !staff.mfaSecret) {
      throw new BadRequestException(
        "Démarrez d'abord la configuration de l'authentificateur",
      );
    }
    const secret = this.crypto.decrypt(staff.mfaSecret);
    const matchedStep = this.matchTotp(secret, code);
    if (matchedStep === null) {
      throw new BadRequestException('Code TOTP invalide');
    }

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      this.createRecoveryCode(),
    );
    const now = new Date();
    await this.prisma.$transaction(
      async (transaction) => {
        const enabled = await transaction.staff.updateMany({
          where: {
            id: staff.id,
            mfaEnabled: false,
            mfaSecret: { not: null },
          },
          // The setup code proves possession of the authenticator, but it is
          // not a login attempt. Keep the anti-replay cursor empty so the
          // operator can sign in immediately after enrollment without having
          // to wait for the next 30-second TOTP window.
          data: { mfaEnabled: true, mfaLastUsedStep: null },
        });
        if (enabled.count !== 1) {
          throw new BadRequestException('Configuration MFA déjà consommée');
        }
        await transaction.staffMfaRecoveryCode.deleteMany({
          where: { staffId: staff.id },
        });
        await transaction.staffMfaRecoveryCode.createMany({
          data: recoveryCodes.map((recoveryCode) => ({
            staffId: staff.id,
            codeHash: this.hashRecoveryCode(staff.id, recoveryCode),
          })),
        });
        await transaction.staffSession.updateMany({
          where: { staffId: staff.id, revokedAt: null },
          data: { revokedAt: now },
        });
      },
      { isolationLevel: 'Serializable' },
    );
    await this.audit.record({
      staffId: staff.id,
      action: 'staff.mfa.enabled',
      resource: 'staff',
      resourceId: staff.id,
      after: { sessionsRevoked: true, recoveryCodeCount: RECOVERY_CODE_COUNT },
      ip,
    });
    return { recoveryCodes, reauthenticationRequired: true };
  }

  async reset(
    staffId: string,
    password: string,
    code: string,
    ip?: string | null,
  ): Promise<{ reauthenticationRequired: true }> {
    const staff = await this.getStaff(staffId);
    if (!staff.mfaEnabled) {
      throw new BadRequestException("La MFA n'est pas active");
    }
    const fullStaff = await this.prisma.staff.findUnique({
      where: { id: staff.id },
    });
    if (
      !fullStaff ||
      !(await this.passwordHasher.verify(fullStaff.password, password))
    ) {
      throw new UnauthorizedException('Mot de passe staff incorrect');
    }
    await this.consumeSecondFactor(staff, code);

    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.staff.update({
        where: { id: staff.id },
        data: {
          mfaEnabled: false,
          mfaSecret: null,
          mfaLastUsedStep: null,
        },
      });
      await transaction.staffMfaRecoveryCode.deleteMany({
        where: { staffId: staff.id },
      });
      await transaction.staffSession.updateMany({
        where: { staffId: staff.id, revokedAt: null },
        data: { revokedAt: now },
      });
    });
    await this.audit.record({
      staffId: staff.id,
      action: 'staff.mfa.reset',
      resource: 'staff',
      resourceId: staff.id,
      after: { sessionsRevoked: true },
      ip,
    });
    return { reauthenticationRequired: true };
  }

  async verifyLoginSecondFactor(staff: MfaStaff, code?: string): Promise<void> {
    if (!staff.mfaEnabled) return;
    if (!code) {
      throw new UnauthorizedException({
        code: 'STAFF_MFA_REQUIRED',
        message: "Un second facteur d'authentification est requis",
      });
    }
    await this.consumeSecondFactor(staff, code);
  }

  private async consumeSecondFactor(staff: MfaStaff, code: string) {
    if (/^\d{6}$/.test(code) && staff.mfaSecret) {
      const matchedStep = this.matchTotp(
        this.crypto.decrypt(staff.mfaSecret),
        code,
      );
      if (matchedStep !== null) {
        const consumed = await this.prisma.staff.updateMany({
          where: {
            id: staff.id,
            mfaEnabled: true,
            OR: [
              { mfaLastUsedStep: null },
              { mfaLastUsedStep: { lt: matchedStep } },
            ],
          },
          data: { mfaLastUsedStep: matchedStep },
        });
        if (consumed.count === 1) return;
      }
    } else {
      const consumed = await this.prisma.staffMfaRecoveryCode.updateMany({
        where: {
          staffId: staff.id,
          codeHash: this.hashRecoveryCode(staff.id, code),
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });
      if (consumed.count === 1) return;
    }
    throw new UnauthorizedException({
      code: 'STAFF_MFA_INVALID',
      message: 'Second facteur invalide ou déjà utilisé',
    });
  }

  private async getStaff(staffId: string): Promise<MfaStaff> {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        deletedAt: true,
        mfaEnabled: true,
        mfaSecret: true,
      },
    });
    if (!staff || staff.deletedAt) {
      throw new NotFoundException('Compte staff introuvable');
    }
    if (staff.status !== StaffStatus.ACTIVE) {
      throw new ForbiddenException('Compte staff inactif');
    }
    return staff;
  }

  private matchTotp(secret: string, code: string): bigint | null {
    const current = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);
    for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
      const step = BigInt(current + offset);
      const expected = this.totp(secret, step);
      const expectedBuffer = Buffer.from(expected);
      const actualBuffer = Buffer.from(code);
      if (
        expectedBuffer.length === actualBuffer.length &&
        timingSafeEqual(expectedBuffer, actualBuffer)
      ) {
        return step;
      }
    }
    return null;
  }

  private totp(secret: string, step: bigint): string {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(step);
    const digest = createHmac('sha1', this.base32Decode(secret))
      .update(counter)
      .digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      (((digest[offset] & 0x7f) << 24) |
        ((digest[offset + 1] & 0xff) << 16) |
        ((digest[offset + 2] & 0xff) << 8) |
        (digest[offset + 3] & 0xff)) >>>
      0;
    return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
  }

  private base32Encode(value: Buffer): string {
    let bits = '';
    for (const byte of value) bits += byte.toString(2).padStart(8, '0');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let encoded = '';
    for (let index = 0; index < bits.length; index += 5) {
      encoded +=
        alphabet[
          Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)
        ];
    }
    return encoded;
  }

  private base32Decode(value: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const character of value.replace(/=+$/, '').toUpperCase()) {
      const index = alphabet.indexOf(character);
      if (index < 0) throw new BadRequestException('Secret TOTP invalide');
      bits += index.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) {
      bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
    }
    return Buffer.from(bytes);
  }

  private createRecoveryCode(): string {
    const bytes = randomBytes(12);
    const raw = Array.from(
      bytes,
      (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length],
    ).join('');
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
  }

  private hashRecoveryCode(staffId: string, code: string): string {
    const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const secret = this.config.getOrThrow<string>('STAFF_OTP_SECRET');
    return createHmac('sha256', secret)
      .update(`staff-mfa-recovery-v1\u0000${staffId}\u0000${normalized}`)
      .digest('hex');
  }

  private buildOtpAuthUri(email: string, secret: string): string {
    const issuer = 'Sovrack Staff';
    return (
      `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}` +
      `?secret=${secret}&issuer=${encodeURIComponent(issuer)}` +
      `&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`
    );
  }
}
