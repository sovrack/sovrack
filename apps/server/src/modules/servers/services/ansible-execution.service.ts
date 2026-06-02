import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, ServerLogLevel } from '@prisma/client';
import { ChildProcess, spawn } from 'child_process';
import { existsSync } from 'fs';
import { chmod, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { ServersCryptoService } from './servers-crypto.service';
import { ServerHostKeyService } from './server-host-key.service';
import { ServersSshService } from './servers-ssh.service';
import type { PreparationRoleKey } from '../shared/server-preparation-options';
import {
  assertSafeLinuxUsername,
  onAbort,
} from '../shared/servers-shell.utils';

type AnsibleLogEvent = {
  level: ServerLogLevel;
  source: 'stdout' | 'stderr';
  message: string;
};

export type RunPreparationInput = {
  roles: PreparationRoleKey[];
  selectedOptions: Record<string, boolean>;
  gitlabRunnerExecutor: string;
  reinstallOptions?: string[];
};

export type RunPreparationCallbacks = {
  onLog?: (event: AnsibleLogEvent) => Promise<void> | void;
};

type RunOptions = {
  signal: AbortSignal;
  timeoutMs: number;
};

export type RunPreparationOptions = RunOptions;

@Injectable()
export class AnsibleExecutionService {
  private readonly logger = new Logger(AnsibleExecutionService.name);

  constructor(
    private readonly crypto: ServersCryptoService,
    private readonly hostKeys: ServerHostKeyService,
    private readonly ssh: ServersSshService,
    private readonly configService: ConfigService,
  ) {}

  async runPreparation(
    server: Server,
    input: RunPreparationInput,
    options: RunOptions,
    callbacks?: RunPreparationCallbacks,
  ): Promise<void> {
    assertSafeLinuxUsername(server.username);
    if (input.roles.length === 0) {
      throw new BadRequestException(
        'Au moins une option de préparation doit être sélectionnée.',
      );
    }

    await this.hostKeys.resolveForConnection(server, {
      allowTrustOnFirstUse: false,
    });
    await this.ssh.assertPasswordlessSudo(server);

    const tmpDir = join(
      tmpdir(),
      `platform-prepare-${server.id}-${Date.now()}`,
    );
    const sshKeyPath = join(tmpDir, 'ssh_key');
    const inventoryPath = join(tmpDir, 'inventory.ini');
    const playbooksRoot = this.resolvePlaybooksRoot();
    const playbookPath = join(playbooksRoot, 'prepare-server.yml');
    const ansibleBin = this.resolveAnsiblePlaybookCommand();
    const ansibleCfg = this.resolveAnsibleConfigPath(playbooksRoot);

    try {
      await mkdir(tmpDir, { recursive: true });
      await writeFile(
        sshKeyPath,
        this.crypto.normalizePrivateKeyFormat(
          this.crypto.decrypt(server.sshKey),
        ),
        { encoding: 'utf-8', mode: 0o600 },
      );
      await chmod(sshKeyPath, 0o600);
      await writeFile(inventoryPath, this.generateInventory(server), 'utf-8');

      const extraVars = JSON.stringify({
        selected_roles: input.roles,
        preparation_options: input.selectedOptions,
        gitlab_runner_executor: input.gitlabRunnerExecutor,
        reinstall_options: input.reinstallOptions ?? [],
        managed_by: 'internal-devops-platform-control-node',
      });

      const args = [
        playbookPath,
        '-i',
        inventoryPath,
        '-u',
        server.username,
        '--private-key',
        sshKeyPath,
        '--timeout',
        '30',
        '--extra-vars',
        extraVars,
        '-v',
      ];

      await this.spawnAnsible(
        ansibleBin,
        args,
        playbooksRoot,
        ansibleCfg,
        options,
        callbacks,
      );
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  resolveAnsiblePlaybookCommand(): string {
    const configuredVenvPath = this.configService.get<string>('ANSIBLE_VENV_PATH', '').trim() || undefined;
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

  resolvePlaybooksRoot(): string {
    const configuredPlaybooksPath = this.configService.get<string>('ANSIBLE_PLAYBOOKS_PATH', '').trim() || undefined;
    return configuredPlaybooksPath
      ? resolve(configuredPlaybooksPath)
      : resolve(process.cwd(), '../devops/ansible/playbooks');
  }

  resolveAnsibleConfigPath(
    playbooksRoot = this.resolvePlaybooksRoot(),
  ): string | undefined {
    const cfgPath = resolve(playbooksRoot, '../ansible.cfg');
    return existsSync(cfgPath) ? cfgPath : undefined;
  }

  generateInventory(server: Server): string {
    const safeHost = this.sanitizeInventoryValue(server.host);
    const safePort = Math.max(1, Math.min(65535, server.port));
    const safeUser = this.sanitizeInventoryValue(server.username);
    const strictHostKeyChecking = this.hostKeys.resolveStrictHostKeyChecking();
    const knownHostsPath = this.hostKeys.resolveKnownHostsPath();
    const commonArgsParts = [
      `-o StrictHostKeyChecking=${strictHostKeyChecking}`,
      '-o ConnectTimeout=10',
      '-o IdentitiesOnly=yes',
      ...(knownHostsPath ? [`-o UserKnownHostsFile=${knownHostsPath}`] : []),
    ];
    const commonArgs = commonArgsParts.join(' ');

    return [
      '[targets]',
      `server_${server.id.substring(0, 8)} ansible_host=${safeHost} ansible_port=${safePort} ansible_user=${safeUser} ansible_python_interpreter=/usr/bin/python3`,
      '',
      '[targets:vars]',
      `ansible_ssh_common_args='${commonArgs}'`,
      'ansible_timeout=30',
      '',
    ].join('\n');
  }

  private async spawnAnsible(
    ansibleBin: string,
    args: string[],
    cwd: string,
    ansibleCfg: string | undefined,
    options: RunOptions,
    callbacks?: RunPreparationCallbacks,
  ): Promise<void> {
    if (options.signal.aborted) {
      throw new BadRequestException(`JOB_TIMEOUT_${String(options.timeoutMs)}`);
    }

    await new Promise<void>((resolvePromise, rejectPromise) => {
      let proc: ChildProcess | null = null;
      let settled = false;
      const recentLogs: string[] = [];

      const emitLog = (source: 'stdout' | 'stderr', raw: string) => {
        for (const line of raw.split(/\r?\n/)) {
          const message = this.sanitizeLogLine(line.trim());
          if (!message) {
            continue;
          }
          const level =
            source === 'stderr' ? ServerLogLevel.WARNING : ServerLogLevel.INFO;
          recentLogs.push(message);
          if (recentLogs.length > 20) {
            recentLogs.shift();
          }
          void callbacks?.onLog?.({ level, source, message });
        }
      };

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

      const cleanup = () => {
        clearTimeout(killTimer);
        detachAbort();
      };

      const resolveOnce = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolvePromise();
      };

      const rejectOnce = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        rejectPromise(error);
      };

      const timeoutError = new BadRequestException(
        `JOB_TIMEOUT_${String(options.timeoutMs)}`,
      );
      const onTimeout = () => {
        this.logger.warn(
          `Ansible process timeout (${String(options.timeoutMs)}ms).`,
        );
        forceKill();
        rejectOnce(timeoutError);
      };

      const killTimer = setTimeout(onTimeout, options.timeoutMs);
      const detachAbort = onAbort(options.signal, onTimeout);

      proc = spawn(ansibleBin, args, {
        cwd,
        env: {
          ...process.env,
          ANSIBLE_HOST_KEY_CHECKING: 'True',
          ANSIBLE_TIMEOUT: '30',
          ANSIBLE_RETRY_FILES_ENABLED: 'False',
          ...(ansibleCfg ? { ANSIBLE_CONFIG: ansibleCfg } : {}),
        },
      });

      proc.stdout?.on('data', (data: Buffer) =>
        emitLog('stdout', data.toString()),
      );
      proc.stderr?.on('data', (data: Buffer) =>
        emitLog('stderr', data.toString()),
      );

      proc.on('close', (code) => {
        if (code === 0) {
          resolveOnce();
          return;
        }
        rejectOnce(
          new BadRequestException(
            `Préparation Ansible échouée (code ${String(code)}): ${recentLogs.slice(-10).join('\n')}`,
          ),
        );
      });

      proc.on('error', (error: Error) => {
        rejectOnce(
          new InternalServerErrorException(
            `Impossible de lancer ansible-playbook depuis la machine de contrôle: ${error.message}`,
          ),
        );
      });
    });
  }

  private sanitizeInventoryValue(value: string): string {
    return value.replace(/[\n\r"'\\;|&$`]/g, '').trim();
  }

  private sanitizeLogLine(value: string): string {
    return value
      .replace(/(--private-key\s+)\S+/gi, '$1[redacted]')
      .replace(/(registration-token\s+)\S+/gi, '$1[redacted]')
      .replace(/(token=)\S+/gi, '$1[redacted]')
      .replace(/(password=)\S+/gi, '$1[redacted]');
  }
}
