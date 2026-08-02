import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppJwtModule } from './shared/jwt/jwt.module';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';
// Contextes consolidés — importés via leur porte publique (barrel index.ts)
import {
  UsersModule,
  AuthModule,
  TeamsModule,
  SshKeysModule,
} from './modules/iam';
import {
  ProjectsModule,
  ServicesModule,
  ServiceEnvironmentsModule,
} from './modules/catalog';
import {
  ServersModule,
  InfrastructureModule,
  ContainersModule,
  VolumesModule,
} from './modules/infrastructure';
import { DomainsModule, ProxyModule } from './modules/networking';
import { MonitoringModule, DashboardModule } from './modules/observability';
// Contextes standalone — importés via leur porte publique (barrel index.ts)
import { SourceProvidersModule } from './modules/source-providers';
import { WebhooksModule } from './modules/webhooks';
import { BuildModule } from './modules/build';
import { DeploymentsModule } from './modules/deployments';
import { PlatformModule } from './modules/platform';
import { AuditModule } from './modules/audit';
import { TerminalModule } from './modules/terminal';
import { AutomationModule } from './modules/automation';
import { ContainerRegistriesModule } from './modules/container-registries';
import { BillingModule } from './modules/billing';
// shared/ (technique pur) + adapters/ (I/O : docker, ssh, ansible)
import { PrismaModule } from './shared/database/prisma.module';
import { LoggerModule } from './shared/logger/logger.module';
import { validateEnv } from './boot/env.validation';
import { CryptoModule } from './shared/crypto/crypto.module';
import { AnsibleModule } from './adapters/provisioning/ansible.module';
import { DockerModule } from './adapters/container-runtime/docker.module';
import { SshModule } from './adapters/ssh/ssh.module';
import { QueueModule } from './shared/queue/queue.module';

@Module({
  imports: [
    AppJwtModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    EventEmitterModule.forRoot({ wildcard: false, global: true }),
    ScheduleModule.forRoot(),
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: true },
    }),
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL?.trim();
        const storage = redisUrl
          ? new ThrottlerStorageRedisService(redisUrl)
          : undefined;
        return {
          throttlers: [{ ttl: 60_000, limit: 120 }],
          ...(storage && { storage }),
        };
      },
    }),
    LoggerModule,
    CryptoModule,
    AnsibleModule,
    DockerModule,
    SshModule,
    QueueModule,
    PrismaModule,
    UsersModule,
    AuthModule,
    BuildModule,
    ProjectsModule,
    SourceProvidersModule,
    WebhooksModule,
    ServersModule,
    InfrastructureModule,
    DeploymentsModule,
    PlatformModule,
    TeamsModule,
    SshKeysModule,
    AuditModule,
    TerminalModule,
    AutomationModule,
    MonitoringModule,
    DomainsModule,
    ContainerRegistriesModule,
    DashboardModule,
    ContainersModule,
    ProxyModule,
    ServiceEnvironmentsModule,
    ServicesModule,
    VolumesModule,
    BillingModule,
  ],
  controllers: [AppController],
  // Guards globaux : rate-limit puis auth JWT (fail-secure — toute route exige
  // un JWT valide sauf si marquée @Public). L'ordre compte (throttle d'abord).
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
