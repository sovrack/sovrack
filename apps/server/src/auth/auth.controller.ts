import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { AuthService, AuthResponse } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';
import { GetUser } from './decorators/get-user.decorator';
import { Roles } from './decorators/roles.decorator';
import type { JwtPayload } from './strategies/jwt.strategy';
import { User, UserRole } from '../users/entities/user.entity';

/**
 * Contrôleur d'authentification
 * Gère les routes d'inscription, connexion et profil utilisateur
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Route d'inscription d'un nouvel utilisateur
   * POST /auth/register
   * @param dto - Données d'enregistrement
   * @returns Token JWT et utilisateur créé
   */
  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return await this.authService.register(dto);
  }

  /**
   * Route de connexion d'un utilisateur
   * POST /auth/login
   * @param dto - Données de connexion
   * @returns Token JWT et utilisateur
   */
  @Post('login')
  @UseGuards(LoginRateLimitGuard)
  async login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return await this.authService.login(dto);
  }

  /**
   * Route pour récupérer les informations de l'utilisateur connecté
   * GET /auth/me
   * Protégée par JWT - nécessite un token valide
   * @param user - Payload JWT de l'utilisateur
   * @returns Informations de l'utilisateur
   */
  @Get('me')
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getMe(@GetUser() user: JwtPayload): Promise<Omit<User, 'password'>> {
    return await this.authService.getMe(user.id);
  }
}
