import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChildProcess, spawn } from 'child_process';
import { existsSync } from 'fs';
import { chmod, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { redactSecrets } from '../../shared/security/redact';

export type AnsibleRunInput = {
  /** Short ID used in inventory host alias (first 8 chars of server id). */
  serverId: string;
  host: string;
  port: number;
  username: string;
  /** Already-decrypted PEM private key. Never pass encrypted value. */
  privateKey: string;
  playbookPath: string;
  extraVars: Record<string, unknown>;
  strictHostKeyChecking?: string; // 'yes' | 'no' | 'accept-new' — default 'yes'
  knownHostsPath?: string;
};

export type AnsibleRunOptions = {
  signal: AbortSignal;
  timeoutMs: number;
};

export type AnsibleLogEvent = {
  level: 'info' | 'warning' | 'error';
  source: 'stdout' | 'stderr';
  message: string;
};

export type AnsibleRunCallbacks = {
  onLog?: (event: AnsibleLogEvent) => void | Promise<void>;
};

@Injectable()
export class AnsibleRunnerService {
  private readonly logger = new Logger(AnsibleRunnerService.name);

  constructor(private readonly configService: ConfigService) {}

  async run(
    input: AnsibleRunInput,
    options: AnsibleRunOptions,
    callbacks?: AnsibleRunCallbacks,
  ): Promise<void> {
    if (options.signal.aborted) {
      throw new BadRequestException(`JOB_TIMEOUT_${String(options.timeoutMs)}`);
    }

    const tmpDir = join(
      tmpdir(),
      `ansible-run-${input.serverId}-${Date.now()}`,
    );
    const sshKeyPath = join(tmpDir, 'ssh_key');
    const inventoryPath = join(tmpDir, 'inventory.ini');
    const ansibleCfg = this.resolveAnsibleConfigPath();

    try {
      await mkdir(tmpDir, { recursive: true });
      await writeFile(sshKeyPath, input.privateKey, {
        encoding: 'utf-8',
        mode: 0o600,
      });
      await chmod(sshKeyPath, 0o600);
      await writeFile(inventoryPath, this.generateInventory(input), 'utf-8');

      const args = [
        input.playbookPath,
        '-i',
        inventoryPath,
        '-u',
        input.username,
        '--private-key',
        sshKeyPath,
        '--timeout',
        '30',
        '--extra-vars',
        JSON.stringify(input.extraVars),
        '-v',
      ];

      await this.runPlaybook(
        args,
        { cwd: this.resolvePlaybooksRoot(), ansibleConfigPath: ansibleCfg },
        options,
        callbacks,
      );
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  generateInventory(
    input: Pick<
      AnsibleRunInput,
      | 'serverId'
      | 'host'
      | 'port'
      | 'username'
      | 'strictHostKeyChecking'
      | 'knownHostsPath'
    >,
  ): string {
    const safeHost = this.sanitize(input.host);
    const safePort = Math.max(1, Math.min(65535, input.port));
    const safeUser = this.sanitize(input.username);
    const hostKeyChecking = input.strictHostKeyChecking ?? 'yes';

    const sshArgsParts = [
      `-o StrictHostKeyChecking=${hostKeyChecking}`,
      '-o ConnectTimeout=10',
      '-o IdentitiesOnly=yes',
      ...(input.knownHostsPath
        ? [`-o UserKnownHostsFile=${input.knownHostsPath}`]
        : []),
    ];

    return [
      '[targets]',
      `server_${input.serverId.substring(0, 8)} ansible_host=${safeHost} ansible_port=${safePort} ansible_user=${safeUser} ansible_python_interpreter=/usr/bin/python3`,
      '',
      '[targets:vars]',
      `ansible_ssh_common_args='${sshArgsParts.join(' ')}'`,
      'ansible_timeout=30',
      '',
    ].join('\n');
  }

  resolvePlaybookBin(): string {
    const venvPath = this.configService
      .get<string>('ANSIBLE_VENV_PATH', '')
      .trim();
    if (!venvPath) return 'ansible-playbook';
    const abs = resolve(venvPath);
    const bin = join(abs, 'bin', 'ansible-playbook');
    if (existsSync(bin)) return bin;
    this.logger.warn(
      `ANSIBLE_VENV_PATH set but ansible-playbook not found at ${bin}, using global.`,
    );
    return 'ansible-playbook';
  }

  resolvePlaybooksRoot(): string {
    const configured = this.configService
      .get<string>('ANSIBLE_PLAYBOOKS_PATH', '')
      .trim();
    if (configured) return resolve(configured);
    // Playbooks embarqués dans le backend (self-contained) : backend/ansible/
    // en dev, /app/ansible en conteneur. Override via ANSIBLE_PLAYBOOKS_PATH.
    return resolve(process.cwd(), 'ansible/playbooks');
  }

  resolveAnsibleConfigPath(
    playbooks = this.resolvePlaybooksRoot(),
  ): string | undefined {
    const cfgPath = resolve(playbooks, '../ansible.cfg');
    return existsSync(cfgPath) ? cfgPath : undefined;
  }

  /**
   * The single place where `ansible-playbook` is spawned in the whole codebase.
   *
   * Accepts a fully-built argument list (starting with the playbook path) and
   * streams redacted log lines through {@link AnsibleRunCallbacks.onLog}. The
   * binary is resolved here (venv-aware), the working directory and ANSIBLE_CONFIG
   * default to the playbooks root when not provided, and a standard, safe env is
   * applied (host-key checking on, retry files off) on top of any `extraEnv`.
   *
   * Returns the full redacted output (stdout+stderr interleaved) and throws on
   * non-zero exit, timeout or spawn error.
   */
  async runPlaybook(
    args: string[],
    context: {
      cwd?: string;
      ansibleConfigPath?: string;
      extraEnv?: Record<string, string>;
    },
    options: AnsibleRunOptions,
    callbacks?: AnsibleRunCallbacks,
  ): Promise<string> {
    if (options.signal.aborted) {
      throw new BadRequestException(`JOB_TIMEOUT_${String(options.timeoutMs)}`);
    }

    const bin = this.resolvePlaybookBin();
    const cwd = context.cwd ?? this.resolvePlaybooksRoot();
    const ansibleCfg =
      context.ansibleConfigPath ?? this.resolveAnsibleConfigPath(cwd);

    return await new Promise<string>((resolve, reject) => {
      let proc: ChildProcess | null = null;
      let settled = false;
      let fullOutput = '';
      const recentLogs: string[] = [];

      const emit = (source: 'stdout' | 'stderr', raw: string) => {
        for (const line of raw.split(/\r?\n/)) {
          const message = redactSecrets(line.trim());
          if (!message) continue;
          const level: AnsibleLogEvent['level'] =
            source === 'stderr' ? 'warning' : 'info';
          fullOutput += `${message}\n`;
          recentLogs.push(message);
          if (recentLogs.length > 20) recentLogs.shift();
          void callbacks?.onLog?.({ level, source, message });
        }
      };

      const kill = () => {
        if (!proc || proc.killed) return;
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (proc && !proc.killed) proc.kill('SIGKILL');
        }, 5_000);
      };

      let abortDetach: (() => void) | null = null;
      let killTimer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (killTimer) clearTimeout(killTimer);
        abortDetach?.();
      };

      const succeed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(fullOutput);
      };
      const fail = (e: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(e);
      };

      const onTimeout = () => {
        this.logger.warn(`Ansible timeout (${String(options.timeoutMs)}ms)`);
        kill();
        const mins = Math.round(options.timeoutMs / 60_000);
        const lastLines = recentLogs.slice(-5).filter(Boolean).join('\n');
        const detail = lastLines
          ? `Ansible a dépassé le délai de ${mins} min.\nDernier output:\n${lastLines}`
          : `Ansible a dépassé le délai de ${mins} min.`;
        fail(
          new BadRequestException(
            `JOB_TIMEOUT_${String(options.timeoutMs)}\n${detail}`,
          ),
        );
      };

      killTimer = setTimeout(onTimeout, options.timeoutMs);
      const listener = () => onTimeout();
      options.signal.addEventListener('abort', listener, { once: true });
      abortDetach = () => options.signal.removeEventListener('abort', listener);

      proc = spawn(bin, args, {
        cwd,
        env: {
          ...process.env,
          ANSIBLE_HOST_KEY_CHECKING: 'True',
          ANSIBLE_TIMEOUT: '30',
          ANSIBLE_RETRY_FILES_ENABLED: 'False',
          ...(ansibleCfg ? { ANSIBLE_CONFIG: ansibleCfg } : {}),
          ...(context.extraEnv ?? {}),
        },
      });

      proc.stdout?.on('data', (d: Buffer) => emit('stdout', d.toString()));
      proc.stderr?.on('data', (d: Buffer) => emit('stderr', d.toString()));

      proc.on('close', (code) => {
        if (code === 0) {
          succeed();
          return;
        }
        const rootCause = this.extractRootCause(fullOutput, recentLogs);
        fail(
          new BadRequestException(
            `Ansible a échoué (code ${String(code)}). Cause racine :\n${rootCause}`,
          ),
        );
      });

      proc.on('error', (err: Error) => {
        fail(
          new InternalServerErrorException(
            `Cannot launch ansible-playbook: ${err.message}`,
          ),
        );
      });
    });
  }

  /**
   * Extrait la cause racine d'une sortie Ansible échouée.
   * Priorité :
   *  1. Lignes `fatal:` avec message d'erreur structuré
   *  2. Lignes `FAILED! =>` avec JSON
   *  3. Dernières lignes du log en fallback
   */
  private extractRootCause(fullOutput: string, recentLogs: string[]): string {
    // Safe coercion of an unknown JSON field — objects become JSON, never
    // "[object Object]".
    const txt = (v: unknown): string =>
      v == null
        ? ''
        : typeof v === 'object'
          ? JSON.stringify(v)
          : String(v as string | number | boolean);
    // Pattern 1: fatal lines with JSON error payload
    const fatalMatch = fullOutput.match(/fatal:.*?FAILED!\s*=>\s*(\{.*\})/s);
    if (fatalMatch?.[1]) {
      try {
        const parsed = JSON.parse(fatalMatch[1]) as Record<string, unknown>;
        const msg = txt(parsed.msg);
        const cmd = txt(parsed.cmd ?? parsed.command);
        const stderr = txt(parsed.stderr);
        const stdout = txt(parsed.stdout);
        const lines = [msg, cmd, stderr, stdout]
          .filter((l) => l && l !== 'undefined' && l !== 'null')
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        if (lines.length > 0) return lines.slice(0, 5).join('\n');
      } catch {
        // JSON parse failed, continue to next pattern
      }
    }

    // Pattern 2: fatal lines with unstructured text
    const fatalText = fullOutput.match(/fatal:.*?FAILED!.*/);
    if (fatalText) {
      return fatalText[0].slice(0, 500);
    }

    // Pattern 3: error/fatal/exception lines
    const errorLines = fullOutput
      .split('\n')
      .filter((l) => /error|fail|fatal|exception/i.test(l))
      .slice(0, 5)
      .filter((l) => l.trim().length > 0);
    if (errorLines.length > 0) return errorLines.join('\n');

    // Fallback: last 10 lines
    return recentLogs.slice(-10).join('\n');
  }

  private sanitize(value: string): string {
    return value.replace(/[\n\r"'\\;|&$`]/g, '').trim();
  }
}
