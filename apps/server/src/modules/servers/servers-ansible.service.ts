import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Server } from '@prisma/client';
import { chmod, writeFile } from 'fs/promises';
import { spawn } from 'child_process';
import { join, resolve } from 'path';
import { ServersCryptoService } from './servers-crypto.service';
import { ServersSshService } from './servers-ssh.service';
import { InstallToolsDto } from './servers.types';

@Injectable()
export class ServersAnsibleService {
  constructor(
    private readonly ssh: ServersSshService,
    private readonly crypto: ServersCryptoService,
  ) {}

  async installToolsDirect(
    server: Server,
    tools: InstallToolsDto,
  ): Promise<Server> {
    this.assertSafeLinuxUsername(server.username);
    return await this.installToolsWithAnsible(server, tools);
  }

  async installToolsWithAnsible(
    server: Server,
    tools: InstallToolsDto,
  ): Promise<Server> {
    const tmpDir = `/tmp/ansible-deploy-${server.id}`;
    const sshKeyPath = `${tmpDir}/ssh_key`;
    const inventoryPath = `${tmpDir}/inventory.ini`;

    const configuredPlaybooksPath = process.env.ANSIBLE_PLAYBOOKS_PATH?.trim();
    const playbooksRoot = configuredPlaybooksPath
      ? resolve(configuredPlaybooksPath)
      : resolve(process.cwd(), '../devops/ansible/playbooks');
    const playbookPath = join(playbooksRoot, 'install-all-tools.yml');

    try {
      await this.ssh.execCommand(`mkdir -p ${tmpDir}`);

      const decryptedKey = this.crypto.decrypt(server.sshKey);
      await writeFile(sshKeyPath, decryptedKey, 'utf-8');
      await chmod(sshKeyPath, 0o600);

      const connection = await this.ssh.openConnection(server);
      try {
        const sudoersConfig =
          'ubuntu ALL=(ALL) NOPASSWD: /usr/bin/apt-get, /usr/bin/apt, /usr/sbin/useradd, /usr/sbin/usermod, /bin/systemctl, /usr/sbin/systemctl, /usr/bin/docker, /usr/sbin/gitlab-runner, /bin/systemctl';

        await connection.target.execCommand(
          `echo '${sudoersConfig}' | sudo tee /etc/sudoers.d/ansible-deploy > /dev/null && sudo chmod 0440 /etc/sudoers.d/ansible-deploy`,
        );
      } finally {
        this.ssh.closeConnection(connection);
      }

      const inventory = this.generateAnsibleInventory(server);
      await writeFile(inventoryPath, inventory, 'utf-8');

      const tags: string[] = [];
      if (tools.docker) {
        tags.push('docker');
      }
      if (tools.ansible) {
        tags.push('ansible');
      }
      if (tools.runner) {
        tags.push('gitlab-runner');
      }

      const tagsArg = tags.length > 0 ? `--tags ${tags.join(',')}` : '';

      const command = [
        'ansible-playbook',
        playbookPath,
        `-i ${inventoryPath}`,
        `-u ${server.username}`,
        `--private-key=${sshKeyPath}`,
        '-v',
        tagsArg,
      ]
        .filter(Boolean)
        .join(' ');

      const logs: string[] = [];
      await new Promise<void>((resolveCommand, rejectCommand) => {
        const proc = spawn('bash', ['-c', command], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            ANSIBLE_HOST_KEY_CHECKING: 'False',
          },
        });

        proc.stdout?.on('data', (data: Buffer) => {
          const line = data.toString().trim();
          if (line) {
            logs.push(line);
          }
        });

        proc.stderr?.on('data', (data: Buffer) => {
          const line = data.toString().trim();
          if (line) {
            logs.push(line);
          }
        });

        proc.on('close', async (code) => {
          try {
            await this.ssh.execCommand(`rm -rf ${tmpDir}`);
          } catch {
            // Non bloquant.
          }

          if (code === 0) {
            resolveCommand();
            return;
          }

          rejectCommand(
            new BadRequestException(`Ansible playbook failed: ${logs.join('\n')}`),
          );
        });

        proc.on('error', (error: Error) => {
          rejectCommand(
            new InternalServerErrorException(
              `Failed to execute Ansible: ${error.message}`,
            ),
          );
        });
      });

      return await this.ssh.verifyServerDirect(server.id);
    } catch (error) {
      throw new BadRequestException(
        `Tools installation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  generateAnsibleInventory(server: Server): string {
    const hostAddress = server.host;
    const timestamp = new Date().toISOString();

    return `[all]\nserver_${server.id.substring(0, 8)} ansible_host=${hostAddress} ansible_port=${server.port} ansible_user=${server.username} ansible_python_interpreter=/usr/bin/python3\n\n[all:vars]\n# Generated for server: ${server.name}\n# Generated at: ${timestamp}\nansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'\nansible_timeout=30\n`;
  }

  private assertSafeLinuxUsername(username: string): void {
    const safePattern = /^[a-z_][a-z0-9_-]{0,30}$/i;
    if (safePattern.test(username)) {
      return;
    }

    throw new BadRequestException(
      'Username SSH invalide: caractères non autorisés',
    );
  }
}
