import {
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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

  private generateTokenForId(id: string, email: string, role: Role): string {
    const payload = {
      id,
      email,
      role,
    };
    return this.jwtService.sign(payload);
  }
}
