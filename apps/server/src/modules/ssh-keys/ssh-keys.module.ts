import { Module } from '@nestjs/common';
import { SshKeysController } from './ssh-keys.controller';
import { SshKeysService } from './ssh-keys.service';
import { ServersModule } from '../servers/servers.module';

@Module({
  imports: [ServersModule],
  controllers: [SshKeysController],
  providers: [SshKeysService],
})
export class SshKeysModule {}
