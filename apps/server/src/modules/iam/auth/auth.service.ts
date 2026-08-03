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
  ) {}

  /**
   * Inscription publique : crée le compte, l'équipe (créateur = membre) et
   * l'abonnement d'essai, puis connecte l'utilisateur.
   * @param dto - Données d'inscription
   * @returns Token JWT et utilisateur sans mot de passe
   */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const user = await this.usersService.create({
      email: dto.email,
      password: dto.password,
      fullName: dto.fullName,
      role: Role.ADMIN,
    });

    try {
      const team = await this.teamsService.create(
        { name: dto.teamName },
        user.id,
      );
      await this.billingService.ensureSubscription(team.id);

      await this.auditService.record(
        user.id,
        'AUTH_REGISTER',
        'User',
        user.id,
        { email: user.email, teamId: team.id },
      );

      this.logger.log(
        `User ${user.email} (${user.id}) registered with team ${team.name} (${team.id})`,
      );
    } catch (err) {
      // Échec de l'étape onboarding : on nettoie le compte pour ne pas laisser
      // un utilisateur orphelin impossible à connecter.
      this.logger.error(
        `Onboarding échoué pour ${user.email}: ${
          err instanceof Error ? err.message : 'erreur inconnue'
        } — suppression du compte`,
      );
      await this.prisma.user
        .delete({ where: { id: user.id } })
        .catch(() => undefined);
      throw err;
    }

    const access_token = this.generateTokenForId(
      user.id,
      user.email,
      user.role,
    );

    return { access_token, user };
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
