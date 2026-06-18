import { Injectable } from '@nestjs/common';
import { chmod, rm, writeFile } from 'fs/promises';
import { NodeSSH } from 'node-ssh';

export type SshConnectParams = {
  host: string;
  port: number;
  username: string;
  /** Already-decrypted PEM private key. Never pass the encrypted value. */
  privateKey?: string;
  /** Password auth (used only for first key install). */
  password?: string;
  /** Base64 host key to pin (TOFU disabled). Null/undefined = no pinning. */
  expectedHostKey?: string | null;
  readyTimeoutMs?: number;
};

export type SshExecResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};

export type SshConnection = {
  client: NodeSSH;
  dispose: () => Promise<void>;
};

/**
 * The single low-level SSH primitive for the whole platform. Every module that
 * needs SSH (servers lifecycle, infrastructure preparation, deployments,
 * monitoring) connects/execs through here — no module instantiates NodeSSH on
 * its own. Owns: temp key-file handling, host-key pinning, exec, timeouts.
 */
@Injectable()
export class SshExecutorService {
  async connect(params: SshConnectParams): Promise<SshConnection> {
    const client = new NodeSSH();
    const tempPaths: string[] = [];

    const options: Parameters<NodeSSH['connect']>[0] = {
      host: params.host,
      port: params.port,
      username: params.username,
      readyTimeout: params.readyTimeoutMs ?? 30_000,
    };

    if (params.privateKey) {
      const keyPath = `/tmp/ssh_exec_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      await writeFile(keyPath, params.privateKey, { mode: 0o600 });
      await chmod(keyPath, 0o600);
      tempPaths.push(keyPath);
      options.privateKeyPath = keyPath;
    }
    if (params.password) {
      options.password = params.password;
    }
    if (params.expectedHostKey) {
      options.hostVerifier = this.buildHostVerifier(params.expectedHostKey);
    }

    try {
      await client.connect(options);
    } catch (error) {
      await Promise.all(
        tempPaths.map((p) => rm(p, { force: true }).catch(() => {})),
      );
      throw error;
    }

    return {
      client,
      dispose: async () => {
        client.dispose();
        await Promise.all(
          tempPaths.map((p) => rm(p, { force: true }).catch(() => {})),
        );
      },
    };
  }

  async exec(conn: SshConnection, command: string): Promise<SshExecResult> {
    const result = await conn.client.execCommand(command);
    return { stdout: result.stdout, stderr: result.stderr, code: result.code };
  }

  async execOrThrow(
    conn: SshConnection,
    command: string,
    failureMessage: string,
  ): Promise<void> {
    const result = await this.exec(conn, command);
    if (result.code !== 0) {
      throw new Error(
        `${failureMessage}: ${result.stderr || result.stdout || 'erreur inconnue'}`,
      );
    }
  }

  buildHostVerifier(
    expectedKeyBase64: string,
  ): (key: Buffer | string) => boolean {
    return (key: Buffer | string) =>
      (Buffer.isBuffer(key) ? key.toString('base64') : key) ===
      expectedKeyBase64;
  }

  async withTimeout<T>(
    task: () => Promise<T>,
    timeoutMs: number,
    onTimeout?: () => void,
  ): Promise<T> {
    let ref: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<T>((_, reject) => {
      ref = setTimeout(() => {
        try {
          onTimeout?.();
        } catch {
          /* never mask the timeout */
        }
        reject(new Error(`SSH_TIMEOUT_${String(timeoutMs)}`));
      }, timeoutMs);
    });
    try {
      return await Promise.race([task(), timeoutPromise]);
    } finally {
      if (ref) clearTimeout(ref);
    }
  }
}
