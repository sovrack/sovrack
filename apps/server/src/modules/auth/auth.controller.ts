import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService, AuthResponse } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from './strategies/jwt.strategy';
import { Role, User } from '@prisma/client';

/**
 * Contrôleur d'authentification
 * Gère les routes de connexion et profil utilisateur
 */
@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Route de connexion d'un utilisateur
   * POST /auth/login
   * @param dto - Données de connexion
   * @returns Token JWT et utilisateur
   */
  @Post('login')
  @UseGuards(LoginRateLimitGuard)
  @ApiOperation({ summary: 'Connexion utilisateur' })
  @ApiResponse({
    status: 200,
    description: 'Connexion réussie avec token JWT',
  })
  @ApiResponse({
    status: 401,
    description: 'Email ou mot de passe incorrect',
  })
  @ApiResponse({
    status: 429,
    description: 'Trop de tentatives de connexion',
  })
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
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Récupérer le profil de l'utilisateur connecté" })
  @ApiResponse({
    status: 200,
    description: 'Profil utilisateur récupéré avec succès',
  })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant' })
  async getMe(@GetUser() user: JwtPayload): Promise<Omit<User, 'password'>> {
    return await this.authService.getMe(user.id);
  }
}
