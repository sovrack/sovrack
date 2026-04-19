import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { GitlabModule } from './modules/gitlab/gitlab.module';
import { ServersModule } from './modules/servers/servers.module';
import { EnvironmentsModule } from './modules/environments/environments.module';
import { ConfigsModule } from './modules/configs/configs.module';
import { DeploymentsModule } from './modules/deployments/deployments.module';
import { PlatformConfigModule } from './modules/platform-config/platform-config.module';
import { TeamsModule } from './modules/teams/teams.module';
import { LoggerModule } from './common/logger/logger.module';
import { validateEnv } from './common/config/env.validation';
import { BuildModule } from './modules/build/build.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    LoggerModule,
    PrismaModule,
    UsersModule,
    AuthModule,
    ProjectsModule,
    GitlabModule,
    ServersModule,
    EnvironmentsModule,
    ConfigsModule,
    DeploymentsModule,
    PlatformConfigModule,
    TeamsModule,
    BuildModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
