import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../../shared/database/prisma.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { StaffAuditService } from './staff-audit.service';
import { StaffJwtStrategy } from './staff-jwt.strategy';
import { StaffJwtAuthGuard, StaffRolesGuard } from './staff.guards';
import { PasswordHasher } from '../iam/security/password-hasher.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { StaffOperationsService } from './staff-operations.service';
import { StaffPasswordRecoveryService } from './staff-password-recovery.service';
import { StaffInvitationService } from './staff-invitation.service';
import { StaffMfaService } from './staff-mfa.service';
import { StaffMfaController } from './staff-mfa.controller';
import { StaffPlatformReadService } from './staff-platform-read.service';
import { StaffPlatformController } from './staff-platform.controller';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ms = require('ms') as (value: string) => number;

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService,
      ): Promise<JwtModuleOptions> | JwtModuleOptions => {
        const expiresInStr = configService.get<string>(
          'STAFF_JWT_EXPIRES_IN',
          '12h',
        );
        return {
          secret: configService.get<string>('STAFF_JWT_SECRET'),
          signOptions: {
            expiresIn: Math.floor(ms(expiresInStr) / 1000),
          },
        };
      },
    }),
  ],
  controllers: [StaffController, StaffMfaController, StaffPlatformController],
  providers: [
    StaffService,
    StaffOperationsService,
    StaffPlatformReadService,
    StaffPasswordRecoveryService,
    StaffInvitationService,
    StaffMfaService,
    StaffAuditService,
    StaffJwtStrategy,
    StaffJwtAuthGuard,
    StaffRolesGuard,
    PasswordHasher,
  ],
  exports: [StaffService, StaffJwtAuthGuard, StaffRolesGuard, StaffMfaService],
})
export class StaffModule {}
