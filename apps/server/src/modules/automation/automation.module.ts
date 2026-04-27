import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { ServersSharedModule } from '../servers/servers-shared.module';
import { AutomationGateway } from './automation.gateway';
import { AutomationController } from './controllers/automation.controller';
import { AutomationRunnerService } from './services/automation-runner.service';
import { AutomationService } from './services/automation.service';

@Module({
  imports: [
    PrismaModule,
    ServersSharedModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): JwtModuleOptions => ({
        secret: cfg.get<string>('JWT_SECRET') ?? '',
      }),
    }),
  ],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationRunnerService, AutomationGateway],
  exports: [AutomationService],
})
export class AutomationModule {}
