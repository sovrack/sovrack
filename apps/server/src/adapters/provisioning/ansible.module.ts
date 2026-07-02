import { Global, Module } from '@nestjs/common';
import { AnsibleRunnerService } from './ansible-runner.service';
import { ANSIBLE_RUNNER } from './ports/ansible-runner.port';

@Global()
@Module({
  providers: [
    AnsibleRunnerService,
    // Port : alias du token vers l'implémentation concrète. Les consommateurs
    // peuvent injecter @Inject(ANSIBLE_RUNNER) IAnsibleRunner → substituable
    // (ex. agent Go), même pattern que SSH_EXECUTOR.
    { provide: ANSIBLE_RUNNER, useExisting: AnsibleRunnerService },
  ],
  exports: [AnsibleRunnerService, ANSIBLE_RUNNER],
})
export class AnsibleModule {}
