import {
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { NotificationsSmtpService } from '../../notifications/notifications-smtp.service';
import { UsersService } from '../users/users.service';
import { PasswordHasher } from '../security/password-hasher.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { EmailVerificationService } from './email-verification.service';
import { Role, WorkspaceType } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { TeamsService } from '../teams/teams.service';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import {
  generateOneTimeCode,
  sealOneTimeCode,
  verifyOneTimeCode,
} from '../security/one-time-code.util';
import { AccountDeletionService } from '../authorization/account-deletion.service';
import { normalizeEmailAddress } from '../../../shared/validation/identity-validation.util';
import { type SafeUser, toSafeUser } from '../users/user-safe-view';
import { UserTokenService } from './user-token.service';
import { UserMfaService } from './user-mfa.service';

/**
 * Réponse d'authentification
 */
export interface AuthResponse {
  access_token: string;
  user: SafeUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly userTokens: UserTokenService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly passwordHasher: PasswordHasher,
    private readonly teamsService: TeamsService,
    private readonly emailVerification: EmailVerificationService,
    private readonly smtp: NotificationsSmtpService,
    private readonly crypto: CryptoService,
    private readonly accountDeletion: AccountDeletionService,
    private readonly userMfa: UserMfaService,
  ) {}

  /**
   * Inscription publique : crée le compte en attente de validation email.
   * Le compte est créé DÉSACTIVÉ (isActive=false) avec un code à 6 chiffres
   * envoyé par email. Ni team, ni abonnement, ni login tant que l'email n'est
   * pas vérifié (voir verifyEmail).
   * @param dto - Données d'inscription
   * @returns Rien d'exploitable côté client (le code part par email)
   */
  async register(
    dto: RegisterDto,
  ): Promise<{ email: string; registrationId: string; devCode?: string }> {
    const email = normalizeEmailAddress(dto.email);
    const resolvedFullName =
      dto.fullName?.trim() || email.split('@')[0] || 'User';
    const pending = await this.emailVerification.startPendingRegistration({
      email,
      password: dto.password,
      fullName: resolvedFullName,
      workspaceName:
        dto.workspaceType === WorkspaceType.ORGANIZATION
          ? dto.workspaceName!.trim()
          : `${resolvedFullName.split(/\s+/)[0]} — Personnel`,
      workspaceType: dto.workspaceType,
      role: Role.MEMBER,
    });

    this.logger.log(`Pending registration created (${pending.registrationId})`);
    return {
      email,
      registrationId: pending.registrationId,
      devCode: pending.devCode,
    };
  }

  /**
   * Vérifie le code email, active le compte, puis réalise l'onboarding
   * (création de la team + abonnement d'essai) et connecte l'utilisateur.
   */
  async verifyEmail(dto: VerifyEmailDto): Promise<AuthResponse> {
    const email = normalizeEmailAddress(dto.email);
    const verified = await this.emailVerification.verifyCodeAndActivate({
      email,
      code: dto.code,
      registrationId: dto.registrationId,
      onActivate: async (pendingUser, database) => {
        const team = await this.teamsService.create(
          {
            name: pendingUser.workspaceName,
            type: pendingUser.workspaceType,
          },
          pendingUser.id,
          database,
        );
        await database.auditLog.create({
          data: {
            userId: pendingUser.id,
            teamId: team.id,
            action: 'AUTH_REGISTER',
            resourceType: 'User',
            resourceId: pendingUser.id,
            metadata: { email: pendingUser.email, teamId: team.id },
          },
        });
      },
    });

    const access_token = this.userTokens.generateAccessToken(verified);

    await this.auditService.record(
      verified.id,
      'AUTH_EMAIL_VERIFIED',
      'User',
      verified.id,
      { email: verified.email },
    );

    const user = await this.usersService.findById(verified.id);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    this.logger.log(
      `User ${verified.email} (${verified.id}) verified and onboarded`,
    );

    return { access_token, user: toSafeUser(user) };
  }

  /**
   * Renvoie un nouveau code de vérification email pour un compte non vérifié.
   */
  async resendVerificationCode(
    email: string,
    registrationId: string,
  ): Promise<{ email: string }> {
    email = normalizeEmailAddress(email);
    await this.emailVerification.resendCode(email, registrationId);
    return { email };
  }

  /**
   * Connecte un utilisateur existant
   * @param dto - Données de connexion
   * @returns Token JWT et utilisateur sans mot de passe
   * @throws UnauthorizedException si les credentials sont invalides
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    // Chercher l'utilisateur par email
    const user = await this.usersService.findByEmail(
      normalizeEmailAddress(dto.email),
    );
    if (!user) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    if (user.legacyStaffRetiredAt) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Vérifie le mot de passe (argon2id, ou bcrypt legacy en transparence).
    // Un compte Google (password=null) n'a pas de mot de passe : login email
    // impossible pour lui (il passe par Google OAuth).
    if (!user.password) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }
    const isPasswordValid = await this.passwordHasher.verify(
      user.password,
      dto.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Bloque explicitement les comptes desactives.
    if (!user.isActive) {
      throw new UnauthorizedException('Votre compte est désactivé');
    }

    await this.userMfa.verifyLoginSecondFactor(user, dto.mfaCode);

    // Migration douce : si le hachage est legacy (bcrypt), on le remplace par
    // argon2id maintenant qu'on a le mot de passe en clair et qu'il est valide.
    // Best-effort — un échec ici ne doit jamais bloquer la connexion.
    if (this.passwordHasher.needsRehash(user.password)) {
      try {
        const rehashed = await this.passwordHasher.hash(dto.password);
        await this.prisma.user.update({
          where: { id: user.id },
          data: { password: rehashed },
        });
      } catch (err) {
        this.logger.warn(
          `Re-hachage argon2id échoué pour ${user.id}: ${
            err instanceof Error ? err.message : 'erreur inconnue'
          }`,
        );
      }
    }

    // Générer le token JWT
    const access_token = this.userTokens.generateAccessToken(user);

    await this.auditService.record(user.id, 'AUTH_LOGIN', 'User', user.id, {
      email: user.email,
    });

    // Retourner la réponse sans le mot de passe
    return {
      access_token,
      user: toSafeUser(user),
    };
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });
    await this.auditService.record(userId, 'AUTH_LOGOUT', 'User', userId);

    return {
      message: 'Déconnexion enregistrée',
    };
  }

  /**
   * Récupère les informations de l'utilisateur connecté
   * @param id - UUID de l'utilisateur
   * @returns Utilisateur sans mot de passe
   * @throws NotFoundException si l'utilisateur n'existe pas
   */
  async getMe(id: string): Promise<SafeUser> {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    return toSafeUser(user);
  }

  /**
   * Mot de passe oublié : génère un code à 6 chiffres (10 min) et l'envoie par
   * email si le compte existe. Ne révèle jamais si l'email est enregistré.
   */
  async forgotPassword(email: string): Promise<{ sent: true }> {
    email = normalizeEmailAddress(email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.emailVerifiedAt) {
      return { sent: true };
    }
    if (
      user.passwordResetRequestedAt &&
      Date.now() - user.passwordResetRequestedAt.getTime() < 60_000
    ) {
      return { sent: true };
    }
    const code = generateOneTimeCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetCode: sealOneTimeCode(this.crypto, {
          code,
          purpose: 'password-reset',
          userId: user.id,
        }),
        passwordResetExpiresAt: expiresAt,
        passwordResetRequestedAt: new Date(),
        passwordResetAttempts: 0,
      },
    });

    try {
      await this.smtp.sendTransactionalEmail(
        user.email,
        'Réinitialisez votre mot de passe',
        `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
          <div style="background:#1e3a8a;padding:16px 24px">
            <span style="color:#fff;font-weight:bold;font-size:16px">Sovrack</span>
          </div>
          <div style="padding:24px">
            <h2 style="color:#111827;font-size:18px;margin:0 0 12px">Réinitialisation du mot de passe</h2>
            <p style="color:#374151;font-size:14px;line-height:1.6">
              Bonjour ${user.fullName},<br/>
              Vous avez demandé à réinitialiser votre mot de passe. Utilisez ce code :
            </p>
            <div style="background:#f3f4f6;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
              <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1e3a8a">${code}</span>
            </div>
            <p style="color:#6b7280;font-size:13px;line-height:1.6">
              Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette
              demande, ignorez cet email.
            </p>
          </div>
        </div>`,
      );
      this.logger.log(`Password reset code sent to ${user.email}`);
    } catch (err) {
      this.logger.warn(
        `Password reset email failed for ${user.email}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    // Deliberately indistinguishable for unknown accounts and SMTP failures.
    return { sent: true };
  }

  /**
   * Réinitialise le mot de passe après validation du code reçu par email.
   */
  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    email = normalizeEmailAddress(email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    const genericInvalidMessage = 'Code de réinitialisation invalide ou expiré';
    if (
      !user ||
      !user.emailVerifiedAt ||
      !user.passwordResetCode ||
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt.getTime() < Date.now() ||
      user.passwordResetAttempts >= 5
    ) {
      throw new BadRequestException(genericInvalidMessage);
    }
    if (
      !verifyOneTimeCode(this.crypto, user.passwordResetCode, {
        code,
        purpose: 'password-reset',
        userId: user.id,
      })
    ) {
      const nextAttempts = user.passwordResetAttempts + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetAttempts: nextAttempts,
          ...(nextAttempts >= 5
            ? {
                passwordResetCode: null,
                passwordResetExpiresAt: null,
                passwordResetRequestedAt: null,
              }
            : {}),
        },
      });
      throw new BadRequestException(genericInvalidMessage);
    }

    const hashed = await this.passwordHasher.hash(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        passwordResetCode: null,
        passwordResetExpiresAt: null,
        passwordResetRequestedAt: null,
        passwordResetAttempts: 0,
        sessionVersion: { increment: 1 },
      },
    });

    await this.auditService.record(
      user.id,
      'AUTH_PASSWORD_RESET',
      'User',
      user.id,
    );
    this.logger.log(`Password reset for ${user.email}`);
    return { message: 'Mot de passe réinitialisé avec succès' };
  }

  /**
   * Envoie un code de confirmation (6 chiffres, 10 min) par email avant
   * suppression du compte.
   */
  async requestAccountDeletion(userId: string): Promise<{ sent: boolean }> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    const code = generateOneTimeCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        deleteAccountCode: sealOneTimeCode(this.crypto, {
          code,
          purpose: 'account-deletion',
          userId,
        }),
        deleteAccountExpiresAt: expiresAt,
      },
    });

    let sent = false;
    try {
      await this.smtp.sendTransactionalEmail(
        user.email,
        'Confirmez la suppression de votre compte',
        `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
          <div style="background:#1e3a8a;padding:16px 24px">
            <span style="color:#fff;font-weight:bold;font-size:16px">Sovrack</span>
          </div>
          <div style="padding:24px">
            <h2 style="color:#111827;font-size:18px;margin:0 0 12px">Suppression définitive du compte</h2>
            <p style="color:#374151;font-size:14px;line-height:1.6">
              Bonjour ${user.fullName},<br/>
              Vous avez demandé la suppression de votre identité et de vos appartenances aux workspaces.
              Les ressources appartenant aux workspaces seront conservées.
              Utilisez ce code pour confirmer :
            </p>
            <div style="background:#fef2f2;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
              <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#b91c1c">${code}</span>
            </div>
            <p style="color:#6b7280;font-size:13px;line-height:1.6">
              Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette
              demande, ignorez cet email et votre compte restera intact.
            </p>
          </div>
        </div>`,
      );
      sent = true;
      this.logger.log(`Deletion code sent to ${user.email}`);
    } catch (err) {
      this.logger.warn(
        `Deletion email failed for ${user.email}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return { sent };
  }

  /**
   * Supprime l'identité et ses appartenances après validation du code.
   * Les ressources restent la propriété de leurs workspaces.
   */
  async confirmAccountDeletion(
    userId: string,
    code: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    if (!user.deleteAccountCode || !user.deleteAccountExpiresAt) {
      throw new BadRequestException(
        'Aucune demande de suppression en attente. Demandez d’abord un code.',
      );
    }
    if (user.deleteAccountExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Le code a expiré. Redemandez un nouveau code.',
      );
    }
    if (
      !verifyOneTimeCode(this.crypto, user.deleteAccountCode, {
        code,
        purpose: 'account-deletion',
        userId,
      })
    ) {
      throw new BadRequestException('Code de confirmation invalide');
    }

    const deletion =
      await this.accountDeletion.scheduleIdentityDeletion(userId);

    this.logger.log(
      `Account ${user.email} (${userId}) scheduled for deletion on ${deletion.scheduledFor.toISOString()}`,
    );
    return {
      message:
        'Votre accès est désactivé. La suppression définitive est programmée dans 30 jours.',
    };
  }

  /**
   * Génère un token JWT pour un utilisateur
   * @param user - Utilisateur pour lequel générer le token
   * @returns Token JWT
   */
  generateWsToken(
    userId: string,
    email: string,
    sessionVersion: number,
  ): string {
    return this.userTokens.generateWsToken(userId, email, sessionVersion);
  }

  /**
   * Génère un token JWT pour un utilisateur authentifié via Google OAuth
   * (id provenant de req.user.id après la stratégie passport).
   */
  async generateTokenForUserId(userId: string): Promise<AuthResponse> {
    return this.userTokens.generateTokenForUserId(userId);
  }
}
