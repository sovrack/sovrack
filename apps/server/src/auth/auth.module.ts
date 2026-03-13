import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RolesGuard } from './guards/roles.guard';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';

/**
 * Module d'authentification
 * Gère la connexion et la validation JWT
 */
@Module({
  imports: [
    UsersModule,
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (
        configService: ConfigService,
      ): Promise<JwtModuleOptions> => {
        const secret = configService.get<string>('JWT_SECRET');
        const expiresIn = configService.get('JWT_EXPIRES_IN') || '24h';

        if (!secret) {
          throw new Error(
            "JWT_SECRET non configuré dans les variables d'environnement",
          );
        }

        return {
          secret,
          signOptions: {
            expiresIn,
          },
        } as JwtModuleOptions;
      },
    }),
  ],
  providers: [AuthService, JwtStrategy, RolesGuard, LoginRateLimitGuard],
  controllers: [AuthController],
})
export class AuthModule {}
