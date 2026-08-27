import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationCodeDto } from './dto/resend-verification-code.dto';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { Public } from '../../../shared/decorators/public.decorator';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { AuthGuard } from '@nestjs/passport';
import { User } from '@prisma/client';
import type { Response } from 'express';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  buildAuthCookieClearOptions,
  buildAuthCookieOptions,
  resolveAuthCookieName,
} from '../../../shared/http/auth-cookie.util';

/**
 * Contrôleur d'authentification
 * Gère les routes de connexion et profil utilisateur
 */
@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Inscription publique : crée le compte en attente de validation email.
   * POST /auth/register
   * @param dto - Données d'inscription
   * @returns { email, registrationId } — le code de validation part par email
   */
  @Post('register')
  @Public() // unauthenticated by definition — self-service signup
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({
    summary:
      'Public self-service signup — creates an account awaiting email verification (code sent by email)',
  })
  @ApiResponse({
    status: 201,
    description: 'Account created awaiting email verification',
  })
  @ApiResponse({
    status: 409,
    description: 'Email déjà utilisé (compte déjà vérifié)',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many registration attempts',
  })
  async register(
    @Body() dto: RegisterDto,
  ): Promise<{ email: string; registrationId: string }> {
    return await this.authService.register(dto);
  }

  /**
   * Vérifie l'email par le code reçu, active le compte et connecte l'utilisateur.
   * POST /auth/verify-email
   */
  @Post('verify-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Verify email with the 6-digit code, then log in',
  })
  @ApiResponse({
    status: 200,
    description: 'Email verified, account activated and connected (JWT cookie)',
  })
  @ApiResponse({
    status: 400,
    description: 'Code invalide ou expiré',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many verification attempts',
  })
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Pick<AuthResponse, 'user'>> {
    const result = await this.authService.verifyEmail(dto);
    response.cookie(
      resolveAuthCookieName(this.configService),
      result.access_token,
      buildAuthCookieOptions(this.configService),
    );
    return { user: result.user };
  }

  /**
   * Renvoie un nouveau code de vérification email.
   * POST /auth/resend-code
   */
  @Post('resend-code')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: 'Resend the email verification code' })
  @ApiResponse({
    status: 201,
    description: 'New code sent',
  })
  @ApiResponse({
    status: 400,
    description: 'Email already verified',
  })
  @ApiResponse({
    status: 404,
    description: 'No pending account with this email',
  })
  async resendCode(
    @Body() dto: ResendVerificationCodeDto,
  ): Promise<{ email: string }> {
    return await this.authService.resendVerificationCode(
      dto.email,
      dto.registrationId,
    );
  }

  /**
   * Route de connexion d'un utilisateur
   * POST /auth/login
   * @param dto - Données de connexion
   * @returns Token JWT et utilisateur
   */
  @Post('login')
  @Public() // unauthenticated by definition — this is where you obtain the JWT
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginRateLimitGuard) // per-IP in-memory guard — independent of the shared throttler
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
  ): Promise<Pick<AuthResponse, 'user'>> {
    const result = await this.authService.login(dto);
    response.cookie(
      resolveAuthCookieName(this.configService),
      result.access_token,
      buildAuthCookieOptions(this.configService),
    );
    return { user: result.user };
  }

  /**
   * Route pour récupérer les informations de l'utilisateur connecté
   * GET /auth/me
   * Protégée par JWT - nécessite un token valide
   * @param user - Payload JWT de l'utilisateur
   * @returns Informations de l'utilisateur
   */
  @Get('ws-token')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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

  /**
   * Démarre la connexion via Google OAuth.
   * GET /auth/google → redirige le navigateur vers accounts.google.com.
   */
  @Get('google')
  @Public()
  @ApiOperation({ summary: 'Start Google OAuth login (redirects to Google)' })
  @ApiResponse({
    status: 302,
    description: 'Redirect to Google consent screen',
  })
  @UseGuards(AuthGuard('google'))
  googleLogin(): void {
    // La redirection est gérée par la stratégie Passport Google.
  }

  /**
   * Callback Google OAuth : Google redirige ici après le consentement.
   * Le guard 'google' exécute la stratégie (find-or-create user), puis on pose
   * le cookie de session JWT et on redirige vers le frontend (FRONTEND_URL).
   * GET /auth/google/callback?code=...
   */
  @Get('google/callback')
  @Public()
  @ApiOperation({ summary: 'Google OAuth callback (sets JWT cookie)' })
  @ApiResponse({
    status: 302,
    description: 'Redirect to frontend with session',
  })
  @ApiResponse({ status: 401, description: 'Google authentication failed' })
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: { user: { id: string } },
    @Res() res: Response,
  ): Promise<void> {
    try {
      const { access_token } = await this.authService.generateTokenForUserId(
        req.user.id,
      );
      res.cookie(
        resolveAuthCookieName(this.configService),
        access_token,
        buildAuthCookieOptions(this.configService),
      );
      const frontendUrl = this.configService.get<string>(
        'FRONTEND_URL',
        'http://localhost:3000',
      );
      res.redirect(frontendUrl);
    } catch (err) {
      const frontendUrl = this.configService.get<string>(
        'FRONTEND_URL',
        'http://localhost:3000',
      );
      const message = encodeURIComponent(
        err instanceof Error ? err.message : 'Authentication failed',
      );
      res.redirect(`${frontendUrl}/login?error=${message}`);
    }
  }

  /**
   * Demandes un code de réinitialisation de mot de passe (email).
   * POST /auth/forgot-password
   */
  @Post('forgot-password')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Request a password reset code by email' })
  @ApiResponse({
    status: 201,
    description: 'Reset code sent (if account exists)',
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ sent: boolean }> {
    return this.authService.forgotPassword(dto.email);
  }

  /**
   * Réinitialise le mot de passe avec le code reçu par email.
   * POST /auth/reset-password
   */
  @Post('reset-password')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Reset the password with the email code' })
  @ApiResponse({ status: 201, description: 'Password reset' })
  @ApiResponse({ status: 400, description: 'Invalid or expired code' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.resetPassword(dto.email, dto.code, dto.password);
  }

  /**
   * Envoie un code de confirmation par email avant suppression du compte.
   * POST /auth/delete-account-request
   */
  @Post('delete-account-request')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Send an account deletion confirmation code by email',
  })
  @ApiResponse({ status: 201, description: 'Confirmation code sent' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async requestAccountDeletion(
    @GetUser() user: JwtPayload,
  ): Promise<{ sent: boolean }> {
    return this.authService.requestAccountDeletion(user.id);
  }

  /**
   * Supprime définitivement le compte (cascade) après validation du code email.
   * DELETE /auth/me
   */
  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete the current account after email confirmation',
  })
  @ApiResponse({ status: 200, description: 'Account deleted' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 400, description: 'Invalid or expired code' })
  async deleteAccount(
    @GetUser() user: JwtPayload,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
    response.clearCookie(
      resolveAuthCookieName(this.configService),
      buildAuthCookieClearOptions(this.configService),
    );
    return this.authService.confirmAccountDeletion(user.id, dto.code);
  }
}
