import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';
import { AppJwtModule } from '../../../shared/jwt/jwt.module';
import { AuditModule } from '../../audit';
import { TeamsModule } from '../teams/teams.module';
import { BillingModule } from '../../billing';

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
    BillingModule,
  ],
  providers: [AuthService, RolesGuard, LoginRateLimitGuard],
  controllers: [AuthController],
})
export class AuthModule {}
