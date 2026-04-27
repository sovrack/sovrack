import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { ServerPreparationGateway } from './server-preparation.gateway';
import {
  AnsibleExecutionService,
  ServerAuditService,
  ServerDetectionService,
  ServerHostKeyService,
  ServerLegacyApiService,
  ServerPreparationService,
  ServerVerificationService,
  ServersCoreService,
  ServersCryptoService,
  ServersJobsService,
  ServersSshService,
} from './services';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
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
  ],
  providers: [
    ServersCoreService,
    ServersCryptoService,
    ServerHostKeyService,
    ServersSshService,
    AnsibleExecutionService,
    ServersJobsService,
    ServerVerificationService,
    ServerDetectionService,
    ServerPreparationService,
    ServerAuditService,
    ServerLegacyApiService,
    ServerPreparationGateway,
  ],
  exports: [
    ServersCoreService,
    ServersCryptoService,
    ServerHostKeyService,
    ServersSshService,
    AnsibleExecutionService,
    ServersJobsService,
    ServerVerificationService,
    ServerDetectionService,
    ServerPreparationService,
    ServerAuditService,
    ServerLegacyApiService,
    ServerPreparationGateway,
  ],
})
export class ServersSharedModule {}
