import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Server } from '@prisma/client';
import { chmod, mkdir, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { ChildProcess, spawn } from 'child_process';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { ServersCryptoService } from './servers-crypto.service';
import { ServersSshService } from './servers-ssh.service';
import { InstallToolsDto } from '../dto/install-tools.dto';
import { ServerExecutionOptions } from '../shared/servers.types';
import {
  assertSafeLinuxUsername,
  onAbort,
} from '../shared/servers-shell.utils';

@Injectable()
export class ServersAnsibleService {
  private readonly logger = new Logger(ServersAnsibleService.name);

  constructor(
    private readonly ssh: ServersSshService,
    private readonly crypto: ServersCryptoService,
  ) {}

  resolveAnsiblePlaybookCommand(): string {
    const configuredVenvPath = process.env.ANSIBLE_VENV_PATH?.trim();
    if (!configuredVenvPath) {
      return 'ansible-playbook';
    }
    const absoluteVenvPath = resolve(configuredVenvPath);
    const venvBinaryPath = join(absoluteVenvPath, 'bin', 'ansible-playbook');
    if (existsSync(venvBinaryPath)) {
      return venvBinaryPath;
    }
    this.logger.warn(
      `ANSIBLE_VENV_PATH défini mais ansible-playbook introuvable (${venvBinaryPath}). Utilisation du binaire global.`,
    );
    return 'ansible-playbook';
  }

  resolveAnsibleConfigPath(): string | undefined {
    const configuredPlaybooksPath = process.env.ANSIBLE_PLAYBOOKS_PATH?.trim();
    const playbooksRoot = configuredPlaybooksPath
      ? resolve(configuredPlaybooksPath)
      : resolve(process.cwd(), '../devops/ansible/playbooks');

    const cfgPath = resolve(playbooksRoot, '../ansible.cfg');
    if (existsSync(cfgPath)) {
      return cfgPath;
    }
    return undefined;
  }

  async installToolsDirect(
    server: Server,
    tools: InstallToolsDto,
    options?: ServerExecutionOptions,
  ): Promise<Server> {
    assertSafeLinuxUsername(server.username);
    return await this.installToolsWithAnsible(server, tools, options);
  }

  async installToolsWithAnsible(
    server: Server,
    tools: InstallToolsDto,
    options?: ServerExecutionOptions,
  ): Promise<Server> {
    assertSafeLinuxUsername(server.username);
    const effectiveTimeoutMs =
      options?.timeoutMs ?? this.resolveDefaultTimeoutMs();

    if (options?.signal.aborted) {
      throw new BadRequestException(
        `JOB_TIMEOUT_${String(effectiveTimeoutMs)}`,
      );
    }

    const tmpDir = join(tmpdir(), `ansible-deploy-${server.id}-${Date.now()}`);
    const sshKeyPath = join(tmpDir, 'ssh_key');
    const inventoryPath = join(tmpDir, 'inventory.ini');

    const configuredPlaybooksPath = process.env.ANSIBLE_PLAYBOOKS_PATH?.trim();
    const playbooksRoot = configuredPlaybooksPath
      ? resolve(configuredPlaybooksPath)
      : resolve(process.cwd(), '../devops/ansible/playbooks');
    const playbookPath = join(playbooksRoot, 'install-all-tools.yml');

    try {
      // Créer le répertoire temporaire via fs/promises (plus sûr que spawn bash)
      await mkdir(tmpDir, { recursive: true });

      const decryptedKey = this.crypto.normalizePrivateKeyFormat(
        this.crypto.decrypt(server.sshKey),
      );
      await writeFile(sshKeyPath, decryptedKey, {
        encoding: 'utf-8',
        mode: 0o600,
      });
      await chmod(sshKeyPath, 0o600);

      if (options?.signal.aborted) {
        throw new BadRequestException(
          `JOB_TIMEOUT_${String(effectiveTimeoutMs)}`,
        );
      }
      await this.ssh.assertPasswordlessSudo(server);

      const inventory = this.generateAnsibleInventory(server);
      await writeFile(inventoryPath, inventory, 'utf-8');

      const tags: string[] = [];
      if (tools.docker) tags.push('docker');
      if (tools.ansible) tags.push('ansible');
      if (tools.runner) tags.push('gitlab-runner');

      const tagsArg = tags.length > 0 ? `--tags ${tags.join(',')}` : '';
      const ansibleBin = this.resolveAnsiblePlaybookCommand();
      const ansibleCfg = this.resolveAnsibleConfigPath();

      const command = [
        ansibleBin,
        playbookPath,
        `-i ${inventoryPath}`,
        `-u ${server.username}`,
        `--private-key=${sshKeyPath}`,
        '--timeout=30',
        '-v',
        tagsArg,
      ]
        .filter(Boolean)
        .join(' ');

      const logs: string[] = [];

      await new Promise<void>((resolvePromise, rejectPromise) => {
        let proc: ChildProcess | null = null;
        let settled = false;

        const forceKill = () => {
          if (!proc || proc.killed) {
            return;
          }
          proc.kill('SIGTERM');
          setTimeout(() => {
            if (proc && !proc.killed) {
              proc.kill('SIGKILL');
            }
          }, 5_000);
        };

        const resolveOnce = () => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(killTimer);
          detachAbort();
          resolvePromise();
        };

        const rejectOnce = (error: Error) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(killTimer);
          detachAbort();
          rejectPromise(error);
        };

        const timeoutError = new BadRequestException(
          `JOB_TIMEOUT_${String(effectiveTimeoutMs)}`,
        );
        const onTimeout = () => {
          this.logger.warn(
            `Ansible process timeout (${String(effectiveTimeoutMs)}ms) for server ${server.name}`,
          );
          forceKill();
          rejectOnce(timeoutError);
        };

        const killTimer = setTimeout(onTimeout, effectiveTimeoutMs);
        const detachAbort = onAbort(options?.signal, onTimeout);

        proc = spawn('bash', ['-c', command], {
          cwd: playbooksRoot,
          env: {
            ...process.env,
            ANSIBLE_HOST_KEY_CHECKING: 'False',
            ANSIBLE_TIMEOUT: '30',
            ANSIBLE_RETRY_FILES_ENABLED: 'False',
            ...(ansibleCfg ? { ANSIBLE_CONFIG: ansibleCfg } : {}),
          },
        });

        proc.stdout?.on('data', (data: Buffer) => {
          const line = data.toString().trim();
          if (line) logs.push(line);
        });

        proc.stderr?.on('data', (data: Buffer) => {
          const line = data.toString().trim();
          if (line) logs.push(line);
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolveOnce();
            return;
          }

          rejectOnce(
            new BadRequestException(
              `Installation Ansible échouée (code ${String(code)}): ${logs.slice(-10).join('\n')}`,
            ),
          );
        });

        proc.on('error', (error: Error) => {
          rejectOnce(
            new InternalServerErrorException(
              `Impossible de lancer Ansible: ${error.message}`,
            ),
          );
        });
      });

      return await this.ssh.verifyServerDirect(server);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const timeoutMatch = rawMessage.match(/JOB_TIMEOUT_\d+/);
      if (timeoutMatch) {
        throw new BadRequestException(timeoutMatch[0]);
      }
      throw new BadRequestException(
        `Installation des outils échouée: ${rawMessage}`,
      );
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  generateAnsibleInventory(server: Server): string {
    const safeHost = this.sanitizeInventoryValue(server.host);
    const safePort = Math.max(1, Math.min(65535, server.port));
    const safeUser = this.sanitizeInventoryValue(server.username);
    const timestamp = new Date().toISOString();
    const commonArgs = [
      '-o StrictHostKeyChecking=no',
      '-o UserKnownHostsFile=/dev/null',
      '-o ConnectTimeout=10',
      '-o IdentitiesOnly=yes',
    ];

    const safeCommonArgs = commonArgs.join(' ');

    return [
      '[targets]',
      `server_${server.id.substring(0, 8)} ansible_host=${safeHost} ansible_port=${safePort} ansible_user=${safeUser} ansible_python_interpreter=/usr/bin/python3`,
      '',
      '[targets:vars]',
      `# Server: ${server.name} | Generated: ${timestamp}`,
      `ansible_ssh_common_args='${safeCommonArgs}'`,
      'ansible_timeout=30',
      '',
    ].join('\n');
  }

  // Nettoie une valeur pour l'inventaire Ansible (empêche les injections)
  private sanitizeInventoryValue(value: string): string {
    return value.replace(/[\n\r"'\\;|&$`]/g, '').trim();
  }

  private resolveDefaultTimeoutMs(): number {
    const candidate = Number(process.env.SERVER_JOB_TIMEOUT_MS);
    if (Number.isFinite(candidate) && candidate >= 10_000) {
      return Math.floor(candidate);
    }
    return 120_000;
  }
}
