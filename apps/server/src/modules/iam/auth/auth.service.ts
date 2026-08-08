import {
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NotificationsSmtpService } from '../../notifications/notifications-smtp.service';
import { UsersService } from '../users/users.service';
import { PasswordHasher } from '../security/password-hasher.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { EmailVerificationService } from './email-verification.service';
import { Role, User } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { TeamsService } from '../teams/teams.service';
import { BillingService } from '../../billing/billing.service';

/**
 * Réponse d'authentification
 */
export interface AuthResponse {
  access_token: string;
  user: Omit<User, 'password'>;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly passwordHasher: PasswordHasher,
    private readonly teamsService: TeamsService,
    private readonly billingService: BillingService,
    private readonly emailVerification: EmailVerificationService,
    private readonly smtp: NotificationsSmtpService,
  ) {}

  /**
   * Inscription publique : crée le compte en attente de validation email.
   * Le compte est créé DÉSACTIVÉ (isActive=false) avec un code à 6 chiffres
   * envoyé par email. Ni team, ni abonnement, ni login tant que l'email n'est
   * pas vérifié (voir verifyEmail).
   * @param dto - Données d'inscription
   * @returns Rien d'exploitable côté client (le code part par email)
   */
  async register(dto: RegisterDto): Promise<{ email: string }> {
    await this.emailVerification.startPendingRegistration({
      email: dto.email,
      password: dto.password,
      fullName: dto.fullName,
      role: Role.OWNER,
    });

    this.logger.log(`Pending registration for ${dto.email}`);
    return { email: dto.email };
  }

  /**
   * Vérifie le code email, active le compte, puis réalise l'onboarding
   * (création de la team + abonnement d'essai) et connecte l'utilisateur.
   */
  async verifyEmail(dto: VerifyEmailDto): Promise<AuthResponse> {
    const verified = await this.emailVerification.verifyCodeAndActivate({
      email: dto.email,
      code: dto.code,
      onActivate: async (userId) => {
        const user = await this.usersService.findById(userId);
        if (!user) return;
        const team = await this.teamsService.create(
          { name: `${user.fullName.split(' ')[0]} Team` },
          userId,
        );
        await this.billingService.ensureSubscription(team.id);
        await this.auditService.record(
          userId,
          'AUTH_REGISTER',
          'User',
          userId,
          { email: user.email, teamId: team.id },
        );
      },
    });

    const access_token = this.generateTokenForId(
      verified.id,
      verified.email,
      verified.role,
    );

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userWithoutPassword } = user;

    this.logger.log(
      `User ${verified.email} (${verified.id}) verified and onboarded`,
    );

    return { access_token, user: userWithoutPassword };
  }

  /**
   * Renvoie un nouveau code de vérification email pour un compte non vérifié.
   */
  async resendVerificationCode(email: string): Promise<{ email: string }> {
    await this.emailVerification.resendCode(email);
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
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
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
    const access_token = this.generateToken(user);

    await this.auditService.record(user.id, 'AUTH_LOGIN', 'User', user.id, {
      email: user.email,
    });

    // Retourner la réponse sans le mot de passe
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userWithoutPassword } = user;
    return {
      access_token,
      user: userWithoutPassword,
    };
  }

  async logout(userId: string): Promise<{ message: string }> {
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
  async getMe(id: string): Promise<Omit<User, 'password'>> {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Retourner l'utilisateur sans le mot de passe
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Mot de passe oublié : génère un code à 6 chiffres (10 min) et l'envoie par
   * email si le compte existe. Ne révèle jamais si l'email est enregistré.
   */
  async forgotPassword(email: string): Promise<{ sent: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.emailVerifiedAt) {
      return { sent: false };
    }
    const code = this.generateSixDigitCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetCode: code, passwordResetExpiresAt: expiresAt },
    });

    let sent = false;
    try {
      await this.smtp.sendBillingEmail(
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
      sent = true;
      this.logger.log(`Password reset code sent to ${user.email}`);
    } catch (err) {
      this.logger.warn(
        `Password reset email failed for ${user.email}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return { sent };
  }

  /**
   * Réinitialise le mot de passe après validation du code reçu par email.
   */
  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.emailVerifiedAt) {
      throw new BadRequestException('Compte introuvable ou non vérifié');
    }
    if (!user.passwordResetCode || !user.passwordResetExpiresAt) {
      throw new BadRequestException(
        'Aucune demande de réinitialisation en attente',
      );
    }
    if (user.passwordResetExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Le code a expiré. Redemandez un nouveau code.',
      );
    }
    if (user.passwordResetCode !== code) {
      throw new BadRequestException('Code de réinitialisation invalide');
    }

    const hashed = await this.passwordHasher.hash(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        passwordResetCode: null,
        passwordResetExpiresAt: null,
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
    const code = this.generateSixDigitCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.prisma.user.update({
      where: { id: userId },
      data: { deleteAccountCode: code, deleteAccountExpiresAt: expiresAt },
    });

    let sent = false;
    try {
      await this.smtp.sendBillingEmail(
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
              Vous avez demandé la suppression de votre compte et de toutes vos données.
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
   * Confirme et exécute la suppression définitive du compte (cascade) après
   * validation du code reçu par email.
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
    if (user.deleteAccountCode !== code) {
      throw new BadRequestException('Code de confirmation invalide');
    }

    // Purge en cascade : projets & serveurs des équipes, puis équipes, puis user.
    await this.prisma.$transaction(async (tx) => {
      const memberships = await tx.teamMember.findMany({
        where: { userId },
        select: { teamId: true },
      });
      const teamIds = memberships.map((m) => m.teamId);

      if (teamIds.length > 0) {
        await tx.project.deleteMany({
          where: { teamId: { in: teamIds } },
        });
        await tx.server.deleteMany({
          where: { teamId: { in: teamIds } },
        });
        await tx.team.deleteMany({
          where: { id: { in: teamIds } },
        });
      }
      await tx.auditLog.deleteMany({ where: { userId } });
      await tx.sshKey.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    this.auditService
      .record(userId, 'ACCOUNT_DELETED', 'User', userId, { email: user.email })
      .catch(() => undefined);

    this.logger.log(`Account ${user.email} (${userId}) deleted`);
    return { message: 'Votre compte a été supprimé définitivement' };
  }

  private generateSixDigitCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /**
   * Génère un token JWT pour un utilisateur
   * @param user - Utilisateur pour lequel générer le token
   * @returns Token JWT
   */
  generateWsToken(userId: string, role: string): string {
    const payload = { sub: userId, role };
    return this.jwtService.sign(payload, { expiresIn: '5m' });
  }

  private generateToken(user: User): string {
    return this.generateTokenForId(user.id, user.email, user.role);
  }

  /**
   * Génère un token JWT pour un utilisateur authentifié via Google OAuth
   * (id provenant de req.user.id après la stratégie passport).
   */
  async generateTokenForUserId(userId: string): Promise<AuthResponse> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé');
    }
    const access_token = this.generateTokenForId(
      user.id,
      user.email,
      user.role,
    );
    await this.auditService.record(
      user.id,
      'AUTH_GOOGLE_LOGIN',
      'User',
      user.id,
      {
        email: user.email,
      },
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userWithoutPassword } = user;
    return { access_token, user: userWithoutPassword };
  }

  private generateTokenForId(id: string, email: string, role: Role): string {
    const payload = {
      id,
      email,
      role,
    };
    return this.jwtService.sign(payload);
  }
}
