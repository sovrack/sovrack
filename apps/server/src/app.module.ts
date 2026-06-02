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
import { GitlabModule } from './modules/git-providers/gitlab/gitlab.module';
import { GitProvidersModule } from './modules/git-providers/git-providers.module';
import { ServersModule } from './modules/servers/servers.module';
import { ConfigsModule } from './modules/projects/app-configs/configs.module';
import { BuildModule } from './modules/build/build.module';
import { DeploymentsModule } from './modules/deployments/deployments.module';
import { PlatformModule } from './modules/platform/platform.module';
import { TeamsModule } from './modules/teams/teams.module';
import { LoggerModule } from './core/logger/logger.module';
import { validateEnv } from './core/config/env.validation';
import { SshKeysModule } from './modules/ssh-keys/ssh-keys.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { TerminalModule } from './modules/terminal/terminal.module';
import { AutomationModule } from './modules/automation/automation.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { DnsModule } from './modules/dns/dns.module';
import { CryptoModule } from './core/crypto/crypto.module';
import { RegistriesModule } from './modules/registries/registries.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

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
    PrismaModule,
    UsersModule,
    AuthModule,
    BuildModule,
    ProjectsModule,
    GitlabModule,
    GitProvidersModule,
    ServersModule,
    ConfigsModule,
    DeploymentsModule,
    PlatformModule,
    TeamsModule,
    SshKeysModule,
    AuditLogsModule,
    TerminalModule,
    AutomationModule,
    MonitoringModule,
    DnsModule,
    RegistriesModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
