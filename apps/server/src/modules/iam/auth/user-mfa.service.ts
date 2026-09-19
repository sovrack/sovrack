import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import {
  buildTotpAuthUri,
  createRecoveryCode,
  createTotpSecret,
  hashRecoveryCode,
  matchTotp,
} from '../../../shared/security/totp.util';
import { PasswordHasher } from '../security/password-hasher.service';

const RECOVERY_CODE_COUNT = 10;

type MfaUser = Pick<
  User,
  'id' | 'email' | 'isActive' | 'mfaEnabled' | 'mfaSecret'
>;

export type UserMfaStatus = {
  enabled: boolean;
  required: false;
  recoveryCodesRemaining: number;
};

@Injectable()
export class UserMfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly passwordHasher: PasswordHasher,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async status(userId: string): Promise<UserMfaStatus> {
    const user = await this.getUser(userId);
    const recoveryCodesRemaining = user.mfaEnabled
      ? await this.prisma.userMfaRecoveryCode.count({
          where: { userId, usedAt: null },
        })
      : 0;
    return {
      enabled: user.mfaEnabled,
      required: false,
      recoveryCodesRemaining,
    };
  }

  async beginSetup(
    userId: string,
  ): Promise<{ secret: string; otpauthUri: string }> {
    const user = await this.getUser(userId);
    if (user.mfaEnabled) {
      throw new BadRequestException(
        'La double authentification est déjà active',
      );
    }
    const secret = createTotpSecret();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: {
          mfaSecret: this.crypto.encrypt(secret),
          mfaEnabled: false,
          mfaLastUsedStep: null,
        },
      });
      await transaction.userMfaRecoveryCode.deleteMany({
        where: { userId: user.id },
      });
    });
    await this.audit.record(user.id, 'AUTH_MFA_SETUP_STARTED', 'User', user.id);
    return {
      secret,
      otpauthUri: buildTotpAuthUri('Sovrack', user.email, secret),
    };
  }

  async enable(
    userId: string,
    code: string,
  ): Promise<{ recoveryCodes: string[]; reauthenticationRequired: true }> {
    const user = await this.getUser(userId);
    if (user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException(
        "Démarrez d'abord la configuration de l'authentificateur",
      );
    }
    const matchedStep = matchTotp(this.crypto.decrypt(user.mfaSecret), code);
    if (matchedStep === null) {
      throw new BadRequestException('Code TOTP invalide');
    }
    const recoveryCodes = Array.from(
      { length: RECOVERY_CODE_COUNT },
      createRecoveryCode,
    );
    await this.prisma.$transaction(
      async (transaction) => {
        const enabled = await transaction.user.updateMany({
          where: { id: user.id, mfaEnabled: false, mfaSecret: { not: null } },
          data: {
            mfaEnabled: true,
            mfaLastUsedStep: null,
            sessionVersion: { increment: 1 },
          },
        });
        if (enabled.count !== 1) {
          throw new BadRequestException('Configuration MFA déjà consommée');
        }
        await transaction.userMfaRecoveryCode.deleteMany({
          where: { userId: user.id },
        });
        await transaction.userMfaRecoveryCode.createMany({
          data: recoveryCodes.map((recoveryCode) => ({
            userId: user.id,
            codeHash: this.hashRecoveryCode(user.id, recoveryCode),
          })),
        });
      },
      { isolationLevel: 'Serializable' },
    );
    await this.audit.record(user.id, 'AUTH_MFA_ENABLED', 'User', user.id, {
      recoveryCodeCount: RECOVERY_CODE_COUNT,
      sessionsRevoked: true,
    });
    return { recoveryCodes, reauthenticationRequired: true };
  }

  async disable(
    userId: string,
    password: string,
    code: string,
  ): Promise<{ reauthenticationRequired: true }> {
    const user = await this.getUser(userId);
    if (!user.mfaEnabled) {
      throw new BadRequestException("La MFA n'est pas active");
    }
    const fullUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });
    if (
      !fullUser?.password ||
      !(await this.passwordHasher.verify(fullUser.password, password))
    ) {
      throw new UnauthorizedException('Mot de passe incorrect');
    }
    await this.consumeSecondFactor(user, code);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: {
          mfaEnabled: false,
          mfaSecret: null,
          mfaLastUsedStep: null,
          sessionVersion: { increment: 1 },
        },
      });
      await transaction.userMfaRecoveryCode.deleteMany({
        where: { userId: user.id },
      });
    });
    await this.audit.record(user.id, 'AUTH_MFA_DISABLED', 'User', user.id, {
      sessionsRevoked: true,
    });
    return { reauthenticationRequired: true };
  }

  async verifyLoginSecondFactor(user: MfaUser, code?: string): Promise<void> {
    if (!user.mfaEnabled) return;
    if (!code) {
      throw new UnauthorizedException({
        code: 'USER_MFA_REQUIRED',
        message: 'Saisissez le code de votre authentificateur',
      });
    }
    await this.consumeSecondFactor(user, code);
  }

  private async consumeSecondFactor(
    user: MfaUser,
    code: string,
  ): Promise<void> {
    if (/^\d{6}$/.test(code) && user.mfaSecret) {
      const matchedStep = matchTotp(this.crypto.decrypt(user.mfaSecret), code);
      if (matchedStep !== null) {
        const consumed = await this.prisma.user.updateMany({
          where: {
            id: user.id,
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
      const consumed = await this.prisma.userMfaRecoveryCode.updateMany({
        where: {
          userId: user.id,
          codeHash: this.hashRecoveryCode(user.id, code),
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });
      if (consumed.count === 1) return;
    }
    throw new UnauthorizedException({
      code: 'USER_MFA_INVALID',
      message: 'Second facteur invalide ou déjà utilisé',
    });
  }

  private async getUser(userId: string): Promise<MfaUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isActive: true,
        mfaEnabled: true,
        mfaSecret: true,
      },
    });
    if (!user) throw new NotFoundException('Compte client introuvable');
    if (!user.isActive) throw new ForbiddenException('Compte client inactif');
    return user;
  }

  private hashRecoveryCode(userId: string, code: string): string {
    return hashRecoveryCode(
      this.config.getOrThrow<string>('CUSTOMER_MFA_SECRET'),
      'customer-mfa-recovery-v1',
      userId,
      code,
    );
  }
}
