import { Global, Module } from '@nestjs/common';
import { SshExecutorService } from './ssh-executor.service';

@Global()
@Module({
  providers: [SshExecutorService],
  exports: [SshExecutorService],
})
export class SshModule {}
