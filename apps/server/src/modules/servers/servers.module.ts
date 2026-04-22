import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { ServersController } from './servers.controller';
import {
  ServerVerificationService,
  ServersAnsibleService,
  ServersCoreService,
  ServersCryptoService,
  ServersJobsService,
  ServersSshService,
} from './services';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [ServersController],
  providers: [
    ServersCoreService,
    ServersCryptoService,
    ServersSshService,
    ServersAnsibleService,
    ServersJobsService,
    ServerVerificationService,
  ],
  exports: [
    ServersCoreService,
    ServersCryptoService,
    ServersSshService,
    ServersAnsibleService,
    ServersJobsService,
    ServerVerificationService,
  ],
})
export class ServersModule {}
