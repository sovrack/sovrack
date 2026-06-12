import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
// Contextes consolidés — importés via leur porte publique (barrel index.ts)
import { UsersModule, AuthModule, TeamsModule, SshKeysModule } from './modules/iam';
import { ProjectsModule, ServicesModule, ServiceEnvironmentsModule } from './modules/catalog';
import { ServersModule, InfrastructureModule, ContainersModule, VolumesModule } from './modules/infrastructure';
import { DomainsModule, ProxyModule, SslModule } from './modules/networking';
import { MonitoringModule, DashboardModule } from './modules/observability';
// Contextes standalone + core
import { PrismaModule } from './core/database/prisma.module';
import { GitlabModule } from './modules/source-providers/gitlab/gitlab.module';
import { SourceProvidersModule } from './modules/source-providers/source-providers.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { BuildModule } from './modules/build/build.module';
import { DeploymentsModule } from './modules/deployments/deployments.module';
import { PlatformModule } from './modules/platform/platform.module';
import { LoggerModule } from './core/logger/logger.module';
import { validateEnv } from './core/config/env.validation';
import { AuditModule } from './modules/audit/audit.module';
import { TerminalModule } from './modules/terminal/terminal.module';
import { AutomationModule } from './modules/automation/automation.module';
import { CryptoModule } from './core/crypto/crypto.module';
import { AnsibleModule } from './core/provisioning/ansible.module';
import { DockerModule } from './core/container-runtime/docker.module';
import { SshModule } from './core/ssh/ssh.module';
import { EventsModule } from './core/events/events.module';
import { QueueModule } from './core/queue/queue.module';
import { ContainerRegistriesModule } from './modules/container-registries/container-registries.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    EventEmitterModule.forRoot({ wildcard: false, global: true }),
    ScheduleModule.forRoot(),
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
    EventsModule,
    QueueModule,
    PrismaModule,
    UsersModule,
    AuthModule,
    BuildModule,
    ProjectsModule,
    GitlabModule,
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
    SslModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
