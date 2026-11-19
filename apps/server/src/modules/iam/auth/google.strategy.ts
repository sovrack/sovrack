import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { GoogleOAuthService } from './google-oauth.service';

/**
 * Stratégie Passport "google" — authenticate via Google OAuth 2.0.
 * Utilisée par AuthGuard('google') sur /auth/google et /auth/google/callback.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    config: ConfigService,
    private readonly googleOAuthService: GoogleOAuthService,
  ) {
    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL:
        config.get<string>('GOOGLE_CALLBACK_URL') ||
        '/backend-api/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  /**
   * Appelé après le consentement Google. Le profil est vérifié par Google ;
   * on exige un email vérifié pour créer le compte.
   */
  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): Promise<{ id: string }> {
    const email = profile.emails?.[0]?.value;
    const googleId = profile.id;
    if (!email || !googleId) {
      throw new UnauthorizedException(
        'Impossible de récupérer votre profil Google',
      );
    }

    const fullName =
      profile.displayName ||
      profile.name?.givenName ||
      email.split('@')[0] ||
      'Utilisateur';

    const user = await this.googleOAuthService.findOrCreateUser({
      googleId,
      email,
      fullName,
    });

    if (!user.isActive) {
      throw new UnauthorizedException('Votre compte est désactivé');
    }

    this.logger.log(`Google authenticated: ${email}`);
    // Passport attache ce retour à req.user.
    return { id: user.id };
  }
}
