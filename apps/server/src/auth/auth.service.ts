import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/entities/user.entity';

/**
 * Réponse d'authentification
 */
export interface AuthResponse {
  access_token: string;
  user: Omit<User, 'password'>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Enregistre un nouvel utilisateur
   * @param dto - Données d'enregistrement
   * @returns Token JWT et utilisateur sans mot de passe
   * @throws ConflictException si l'email existe déjà
   */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    // Vérifier si l'email existe déjà
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Cet email est déjà utilisé');
    }

    // Hasher le mot de passe avec bcrypt (salt: 10)
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Créer l'utilisateur en base de données
    const user = await this.usersService.create({
      email: dto.email,
      password: hashedPassword,
      fullName: dto.fullName,
    });

    // Générer le token JWT
    const access_token = this.generateToken(user);

    // Retourner la réponse sans le mot de passe
    const { password, ...userWithoutPassword } = user;
    return {
      access_token,
      user: userWithoutPassword,
    };
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

    // Comparer le mot de passe avec bcrypt
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Générer le token JWT
    const access_token = this.generateToken(user);

    // Retourner la réponse sans le mot de passe
    const { password, ...userWithoutPassword } = user;
    return {
      access_token,
      user: userWithoutPassword,
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
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Génère un token JWT pour un utilisateur
   * @param user - Utilisateur pour lequel générer le token
   * @returns Token JWT
   */
  private generateToken(user: User): string {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwtService.sign(payload);
  }
}
