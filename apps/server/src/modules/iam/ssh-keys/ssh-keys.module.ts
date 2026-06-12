import { Module } from '@nestjs/common';
import { SshKeysController } from './ssh-keys.controller';
import { SshKeysService } from './ssh-keys.service';
import { ServersSharedModule } from '../../servers/servers-shared.module';

@Module({
  imports: [ServersSharedModule],
  controllers: [SshKeysController],
  providers: [SshKeysService],
})
export class SshKeysModule {}
