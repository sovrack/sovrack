import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { GitlabModule } from './gitlab/gitlab.module';
import { ServersModule } from './servers/servers.module';
import { EnvironmentsModule } from './environments/environments.module';
import { ConfigsModule } from './configs/configs.module';
import { DeploymentsModule } from './deployments/deployments.module';
import { PlatformConfigModule } from './platform-config/platform-config.module';
import { TeamsModule } from './teams/teams.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
