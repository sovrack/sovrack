import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import {
  ServerAuditModule,
  ServerDetectionModule,
  ServerLegacyModule,
  ServerManagementModule,
  ServerPreparationModule,
  ServerValidationModule,
} from './modules';
import { ServersSharedModule } from './servers-shared.module';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error(
            "JWT_SECRET non configuré dans les variables d'environnement",
          );
        }
        return { secret };
      },
    }),
    ServersSharedModule,
    ServerManagementModule,
    ServerValidationModule,
    ServerDetectionModule,
    ServerPreparationModule,
    ServerAuditModule,
    ServerLegacyModule,
  ],
  exports: [ServersSharedModule],
})
export class ServersModule {}
