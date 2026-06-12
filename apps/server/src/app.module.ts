import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './core/database/prisma.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { GitlabModule } from './modules/source-providers/gitlab/gitlab.module';
import { SourceProvidersModule } from './modules/source-providers/source-providers.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { ServersModule } from './modules/servers/servers.module';
import { InfrastructureModule } from './modules/infrastructure/infrastructure.module';
import { BuildModule } from './modules/build/build.module';
import { DeploymentsModule } from './modules/deployments/deployments.module';
import { PlatformModule } from './modules/platform/platform.module';
import { TeamsModule } from './modules/teams/teams.module';
import { LoggerModule } from './core/logger/logger.module';
import { validateEnv } from './core/config/env.validation';
import { SshKeysModule } from './modules/ssh-keys/ssh-keys.module';
import { AuditModule } from './modules/audit/audit.module';
import { TerminalModule } from './modules/terminal/terminal.module';
import { AutomationModule } from './modules/automation/automation.module';
import { MonitoringModule } from './modules/observability/monitoring/monitoring.module';
import { DomainsModule } from './modules/networking/domains/domains.module';
import { CryptoModule } from './core/crypto/crypto.module';
import { AnsibleModule } from './core/provisioning/ansible.module';
import { DockerModule } from './core/container-runtime/docker.module';
import { SshModule } from './core/ssh/ssh.module';
import { EventsModule } from './core/events/events.module';
import { QueueModule } from './core/queue/queue.module';
import { ContainerRegistriesModule } from './modules/container-registries/container-registries.module';
import { DashboardModule } from './modules/observability/dashboard/dashboard.module';
import { ContainersModule } from './modules/containers/containers.module';
import { ProxyModule } from './modules/networking/proxy/proxy.module';
import { VolumesModule } from './modules/volumes/volumes.module';
import { ServiceEnvironmentsModule } from './modules/service-environments/service-environments.module';
import { ServicesModule } from './modules/services/services.module';
import { SslModule } from './modules/networking/ssl/ssl.module';

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
