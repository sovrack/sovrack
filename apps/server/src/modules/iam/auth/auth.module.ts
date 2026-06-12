import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';
import { AppJwtModule } from '../../../core/jwt/jwt.module';
import { AuditModule } from '../../audit/audit.module';

/**
 * Module d'authentification
 * Gère la connexion et la validation JWT
 */
@Module({
  imports: [
    UsersModule,
    PassportModule,
    AppJwtModule,
    AuditModule,
  ],
  providers: [AuthService, RolesGuard, LoginRateLimitGuard],
  controllers: [AuthController],
})
export class AuthModule {}
