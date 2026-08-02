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
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { Public } from '../../../shared/decorators/public.decorator';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { Role, User } from '@prisma/client';
import type { Response } from 'express';
import {
  buildAuthCookieClearOptions,
  buildAuthCookieOptions,
  resolveAuthCookieName,
} from '../../../shared/http/auth-cookie.util';

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
   * Inscription publique : compte + équipe + essai billing, puis connexion.
   * POST /auth/register
   * @param dto - Données d'inscription
   * @returns Token JWT et utilisateur
   */
  @Post('register')
  @Public() // unauthenticated by definition — self-service signup
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({
    summary: 'Public self-service signup (account + team + trial)',
  })
  @ApiResponse({
    status: 201,
    description: 'Account created with JWT token',
  })
  @ApiResponse({
    status: 409,
    description: 'Email déjà utilisé',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many registration attempts',
  })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.register(dto);
    response.cookie(
      resolveAuthCookieName(this.configService),
      result.access_token,
      buildAuthCookieOptions(this.configService),
    );
    return result;
  }

  /**
   * Route de connexion d'un utilisateur
   * POST /auth/login
   * @param dto - Données de connexion
   * @returns Token JWT et utilisateur
   */
  @Post('login')
  @Public() // unauthenticated by definition — this is where you obtain the JWT
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({
    status: 200,
    description: 'Login successful with JWT token',
  })
  @ApiResponse({
    status: 401,
    description: 'Email ou mot de passe incorrect',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many connection attempts',
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
    summary: 'Returns a short-lived token for WebSocket connections',
  })
  @ApiResponse({ status: 200, description: 'WebSocket token generated' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  getWsToken(@GetUser() user: JwtPayload): { wsToken: string } {
    const wsToken = this.authService.generateWsToken(user.id, user.role);
    return { wsToken };
  }

  @Get('me')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the logged-in user's profile" })
  @ApiResponse({
    status: 200,
    description: 'User profile fetched successfully',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  async getMe(@GetUser() user: JwtPayload): Promise<Omit<User, 'password'>> {
    return await this.authService.getMe(user.id);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'User logout (audit)' })
  @ApiResponse({ status: 201, description: 'Logout recorded' })
  @ApiResponse({ status: 401, description: 'Invalid or expired JWT token' })
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
