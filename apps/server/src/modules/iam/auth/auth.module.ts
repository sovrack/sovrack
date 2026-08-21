import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { EmailVerificationService } from './email-verification.service';
import { GoogleOAuthService } from './google-oauth.service';
import { GoogleStrategy } from './google.strategy';
import { UsersModule } from '../users/users.module';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';
import { AppJwtModule } from '../../../shared/jwt/jwt.module';
import { AuditModule } from '../../audit';
import { TeamsModule } from '../teams/teams.module';
import { NotificationsModule } from '../../notifications';

/**
 * Module d'authentification
 * Gère l'inscription, la connexion et la validation JWT
 */
@Module({
  imports: [
    UsersModule,
    PassportModule,
    AppJwtModule,
    AuditModule,
    TeamsModule,
    NotificationsModule,
  ],
  providers: [
    AuthService,
    LoginRateLimitGuard,
    EmailVerificationService,
    GoogleOAuthService,
    // La stratégie Google n'est instanciée QUE si les variables Google OAuth
    // sont renseignées. Sinon (dev, ou pas encore configuré), la valeur fournie
    // est `undefined` : l'app tourne normalement et AuthGuard('google') reste
    // inutilisable tant que la feature n'est pas configurée.
    {
      provide: GoogleStrategy,
      inject: [ConfigService, GoogleOAuthService],
      useFactory: (
        config: ConfigService,
        googleOAuthService: GoogleOAuthService,
      ) => {
        const clientId = config.get<string>('GOOGLE_CLIENT_ID');
        const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET');
        if (!clientId || !clientSecret) {
          return undefined as unknown as GoogleStrategy;
        }
        return new GoogleStrategy(config, googleOAuthService);
      },
    },
  ],
  controllers: [AuthController],
})
export class AuthModule {}
