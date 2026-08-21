import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { NotificationsSmtpService } from '../../notifications/notifications-smtp.service';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import { PasswordHasher } from '../security/password-hasher.service';
import { Prisma, Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  generateOneTimeCode,
  sealOneTimeCode,
  verifyOneTimeCode,
} from '../security/one-time-code.util';

export const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;

/**
 * EmailVerificationService — validation de l'email par code à 6 chiffres.
 *
 * Flux :
 *  - register crée un compte DÉSACTIVÉ (isActive=false) + code + expiration,
 *    et envoie le code par email. Ni team, ni abonnement, ni login à ce stade.
 *  - verify-email valide le code, active le compte, puis appelle le callback
 *    d'onboarding (création team + abonnement essai) fourni par AuthService.
 *  - resend-code régénère un code et le renvoie (rate-limité par le controller).
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smtp: NotificationsSmtpService,
    private readonly passwordHasher: PasswordHasher,
    private readonly crypto: CryptoService,
  ) {}

  /**
   * Crée (ou met à jour) un compte en attente de vérification email.
   * Le compte est inactif tant que l'email n'est pas confirmé.
   */
  async startPendingRegistration(params: {
    email: string;
    password: string;
    fullName: string;
    workspaceName: string;
    role: Role;
  }): Promise<{ registrationId: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: params.email },
      select: { id: true, emailVerifiedAt: true, isActive: true },
    });
    if (existing) {
      if (existing.emailVerifiedAt || existing.isActive) {
        throw new ConflictException('Cet email est déjà utilisé');
      }
      const hashedPassword = await this.passwordHasher.hash(params.password);
      const registrationId = randomUUID();
      // Une nouvelle tentative remplace intégralement l'ancienne tentative en
      // attente. Le nonce empêche de valider le mot de passe d'une tentative
      // différente avec un code saisi dans un ancien formulaire.
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          password: hashedPassword,
          fullName: params.fullName,
          pendingWorkspaceName: params.workspaceName,
          emailVerificationAttemptId: registrationId,
        },
      });
      await this.issueAndSendCode(existing.id, params.email, registrationId);
      return { registrationId };
    }

    const hashedPassword = await this.passwordHasher.hash(params.password);
    const code = generateOneTimeCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
    const registrationId = randomUUID();
    const userId = randomUUID();

    const user = await this.prisma.user.create({
      data: {
        id: userId,
        email: params.email,
        password: hashedPassword,
        fullName: params.fullName,
        pendingWorkspaceName: params.workspaceName,
        role: params.role,
        isActive: false,
        emailVerificationCode: sealOneTimeCode(this.crypto, {
          code,
          purpose: 'email-verification',
          userId,
          attemptId: registrationId,
        }),
        emailVerificationExpiresAt: expiresAt,
        emailVerificationAttemptId: registrationId,
      },
      select: { id: true, email: true },
    });

    await this.sendCodeEmail(user.id, user.email, code);
    this.logger.log(`Pending registration for ${params.email} (${user.id})`);
    return { registrationId };
  }

  /**
   * Valide le code, active le compte et exécute l'onboarding (team + billing).
   * Retourne l'utilisateur activé.
   */
  async verifyCodeAndActivate(params: {
    email: string;
    code: string;
    registrationId: string;
    onActivate: (
      pendingUser: {
        id: string;
        email: string;
        fullName: string;
        workspaceName: string;
      },
      database: Prisma.TransactionClient,
    ) => Promise<void>;
  }): Promise<{
    id: string;
    email: string;
    role: Role;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { email: params.email },
    });
    if (!user) {
      throw new NotFoundException('Aucun compte avec cet email');
    }
    if (user.emailVerifiedAt) {
      throw new BadRequestException('Cet email est déjà vérifié');
    }
    if (!user.emailVerificationCode || !user.emailVerificationExpiresAt) {
      throw new BadRequestException(
        'Aucun code de vérification demandé — réessayez l’inscription',
      );
    }
    if (user.emailVerificationExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Le code a expiré. Demandez un nouveau code.',
      );
    }
    if (user.emailVerificationAttemptId !== params.registrationId) {
      throw new BadRequestException(
        "Cette tentative d'inscription n'est plus valide. Recommencez l'inscription.",
      );
    }
    if (
      !verifyOneTimeCode(this.crypto, user.emailVerificationCode, {
        code: params.code,
        purpose: 'email-verification',
        userId: user.id,
        attemptId: params.registrationId,
      })
    ) {
      throw new BadRequestException('Code de vérification invalide');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: new Date(),
          isActive: true,
          emailVerificationCode: null,
          emailVerificationExpiresAt: null,
          emailVerificationAttemptId: null,
          pendingWorkspaceName: null,
        },
      });
      await params.onActivate(
        {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          workspaceName:
            user.pendingWorkspaceName?.trim() ||
            `${user.fullName.split(' ')[0]} Workspace`,
        },
        tx,
      );
    });

    this.logger.log(`Email verified for ${user.email} (${user.id})`);
    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  /**
   * Régénère un code pour un compte non vérifié et le renvoie.
   */
  async resendCode(email: string, registrationId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        emailVerifiedAt: true,
        isActive: true,
        emailVerificationAttemptId: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Aucun compte avec cet email');
    }
    if (user.emailVerifiedAt || user.isActive) {
      throw new BadRequestException('Cet email est déjà vérifié');
    }
    if (user.emailVerificationAttemptId !== registrationId) {
      throw new BadRequestException(
        "Cette tentative d'inscription n'est plus valide. Recommencez l'inscription.",
      );
    }
    await this.issueAndSendCode(user.id, email, registrationId);
  }

  private async issueAndSendCode(
    userId: string,
    email: string,
    registrationId: string,
  ): Promise<void> {
    const code = generateOneTimeCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationCode: sealOneTimeCode(this.crypto, {
          code,
          purpose: 'email-verification',
          userId,
          attemptId: registrationId,
        }),
        emailVerificationExpiresAt: expiresAt,
        isActive: false,
      },
    });
    await this.sendCodeEmail(userId, email, code);
  }

  private async sendCodeEmail(
    userId: string,
    email: string,
    code: string,
  ): Promise<void> {
    try {
      await this.smtp.sendBillingEmail(
        email,
        'Votre code de vérification',
        `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
          <div style="background:#1e3a8a;padding:16px 24px">
            <span style="color:#fff;font-weight:bold;font-size:16px">Sovrack</span>
          </div>
          <div style="padding:24px">
            <h2 style="color:#111827;font-size:18px;margin:0 0 12px">Vérification de votre email</h2>
            <p style="color:#374151;font-size:14px;line-height:1.6">
              Bonjour,<br/>Utilisez ce code pour valider votre adresse email :
            </p>
            <div style="background:#f3f4f6;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
              <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1e3a8a">${code}</span>
            </div>
            <p style="color:#6b7280;font-size:13px;line-height:1.6">
              Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette
              inscription, ignorez cet email.
            </p>
          </div>
        </div>
        `,
      );
      this.logger.log(`Verification email sent to ${email} (${userId})`);
    } catch (err) {
      this.logger.warn(
        `Verification email failed for ${email}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
