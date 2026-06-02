import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService, AuthResponse } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';
import { GetUser } from '../../core/decorators/get-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import type { JwtPayload } from '../../core/jwt/dto/jwt-payload.dto';
import { Role, User } from '@prisma/client';
import type { Response } from 'express';
import {
  buildAuthCookieClearOptions,
  buildAuthCookieOptions,
  resolveAuthCookieName,
} from '../../core/http/auth-cookie.util';

/**
 * Contrôleur d'authentification
 * Gère les routes de connexion et profil utilisateur
 */
@SkipThrottle()
@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Route de connexion d'un utilisateur
   * POST /auth/login
   * @param dto - Données de connexion
   * @returns Token JWT et utilisateur
   */
  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
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
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.login(dto);
    response.cookie(
      resolveAuthCookieName(this.configService),
      result.access_token,
      buildAuthCookieOptions(this.configService),
    );
    return result;
  }

  /**
   * Route pour récupérer les informations de l'utilisateur connecté
   * GET /auth/me
   * Protégée par JWT - nécessite un token valide
   * @param user - Payload JWT de l'utilisateur
   * @returns Informations de l'utilisateur
   */
  @Get('ws-token')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Retourne un jeton court durée pour les connexions WebSocket',
  })
  @ApiResponse({ status: 200, description: 'Jeton WebSocket généré' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Rôle insuffisant' })
  getWsToken(@GetUser() user: JwtPayload): { wsToken: string } {
    const wsToken = this.authService.generateWsToken(user.id, user.role);
    return { wsToken };
  }

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

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Déconnexion utilisateur (audit)' })
  @ApiResponse({ status: 201, description: 'Déconnexion enregistrée' })
  @ApiResponse({ status: 401, description: 'Token JWT invalide ou expiré' })
  async logout(
    @GetUser() user: JwtPayload,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
    response.clearCookie(
      resolveAuthCookieName(this.configService),
      buildAuthCookieClearOptions(this.configService),
    );
    return await this.authService.logout(user.id);
  }
}
