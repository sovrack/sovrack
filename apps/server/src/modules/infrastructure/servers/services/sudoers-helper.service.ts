import { Injectable, Logger } from '@nestjs/common';
import { NodeSSH } from 'node-ssh';
import {
  assertSafeLinuxUsername,
  shellQuote,
} from '../shared/servers-shell.util';

@Injectable()
export class SudoersHelper {
  private readonly logger = new Logger(SudoersHelper.name);
  private readonly automationSudoersPath = '/etc/sudoers.d/platform-deploy';

  buildAutomationSudoersRule(username: string): string {
    assertSafeLinuxUsername(username);
    return `${username} ALL=(ALL) NOPASSWD: ALL`;
  }

  async tryEnablePasswordlessSudo(
    ssh: NodeSSH,
    username: string,
    password: string,
  ): Promise<boolean> {
    if (this.isRootUser(username)) {
      return true;
    }

    const sudoersRule = this.buildAutomationSudoersRule(username);
    const escapedPassword = shellQuote(password);
    const escapedSudoersRule = shellQuote(sudoersRule);
    const writeSudoersCommand = shellQuote(
      `echo ${escapedSudoersRule} > ${this.automationSudoersPath} && chmod 0440 ${this.automationSudoersPath}`,
    );

    const result = await ssh.execCommand(
      `printf '%s\\n' ${escapedPassword} | sudo -S -p '' sh -c ${writeSudoersCommand}`,
    );

    if (result.code !== 0) {
      this.logger.warn(
        `Passwordless sudo setup skipped for ${username}: ${result.stderr || result.stdout || 'unknown error'}`,
      );
      return false;
    }

    const verify = await ssh.execCommand('sudo -n true');
    if (verify.code !== 0) {
      this.logger.warn(
        `Passwordless sudo verification failed for ${username}: ${verify.stderr || verify.stdout || 'unknown error'}`,
      );
      return false;
    }

    return true;
  }

  private isRootUser(username: string): boolean {
    return username.trim().toLowerCase() === 'root';
  }
}
