import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { ServersAnsibleService } from './servers-ansible.service';
import { ServersController } from './servers.controller';
import { ServersCryptoService } from './servers-crypto.service';
import { ServersJobsService } from './servers-jobs.service';
import { ServersRunnerService } from './servers-runner.service';
import { ServersService } from './servers.service';
import { ServersSshService } from './servers-ssh.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [ServersController],
  providers: [
    ServersService,
    ServersCryptoService,
    ServersSshService,
    ServersAnsibleService,
    ServersJobsService,
    ServersRunnerService,
  ],
  exports: [
    ServersService,
    ServersCryptoService,
    ServersSshService,
    ServersAnsibleService,
    ServersJobsService,
    ServersRunnerService,
  ],
})
export class ServersModule {}
