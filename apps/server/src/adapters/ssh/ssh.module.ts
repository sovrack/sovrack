import { Global, Module } from '@nestjs/common';
import { SshExecutorService } from './ssh-executor.service';
import { SshConnectionPoolService } from './ssh-connection-pool.service';
import { ServerHostKeyService } from './server-host-key.service';
import { ServersCryptoService } from './servers-crypto.service';
import { SSH_EXECUTOR } from './ports/ssh-executor.port';

@Global()
@Module({
  providers: [
    SshExecutorService,
    // Port : alias du token vers l'implémentation concrète. Les consommateurs
    // injectent @Inject(SSH_EXECUTOR) ISshExecutor → substituable (agent Go).
    { provide: SSH_EXECUTOR, useExisting: SshExecutorService },
    SshConnectionPoolService,
    ServerHostKeyService,
    ServersCryptoService,
  ],
  exports: [
    SshExecutorService,
    SSH_EXECUTOR,
    SshConnectionPoolService,
    ServerHostKeyService,
    ServersCryptoService,
  ],
})
export class SshModule {}
