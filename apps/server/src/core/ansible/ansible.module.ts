import { Global, Module } from '@nestjs/common';
import { AnsibleRunnerService } from './ansible-runner.service';

@Global()
@Module({
  providers: [AnsibleRunnerService],
  exports: [AnsibleRunnerService],
})
export class AnsibleModule {}
