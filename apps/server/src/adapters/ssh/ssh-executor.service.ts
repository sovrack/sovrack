import { Injectable } from '@nestjs/common';
import { NodeSSH } from 'node-ssh';
import type {
  ISshExecutor,
  SshConnectParams,
  SshConnection,
  SshExecResult,
} from './ports/ssh-executor.port';

// Types déplacés dans le port (leur contrat) ; ré-exportés ici pour la
// rétrocompat des importeurs existants.
export type {
  SshConnectParams,
  SshExecResult,
  SshConnection,
} from './ports/ssh-executor.port';

/**
 * The single low-level SSH primitive for the whole platform. Every module that
 * needs SSH (servers lifecycle, infrastructure preparation, deployments,
 * monitoring) connects/execs through here — no module instantiates NodeSSH on
 * its own. Owns: temp key-file handling, host-key pinning, exec, timeouts.
 */
@Injectable()
export class SshExecutorService implements ISshExecutor {
  async connect(params: SshConnectParams): Promise<SshConnection> {
    const client = new NodeSSH();

    const options: Parameters<NodeSSH['connect']>[0] = {
      host: params.host,
      port: params.port,
      username: params.username,
      readyTimeout: params.readyTimeoutMs ?? 30_000,
    };

    // Pass the decrypted private key IN MEMORY (node-ssh `privateKey` = the key
    // CONTENT, not a path). We never write it to a temp file, so there is no
    // on-disk trace, nothing left behind on a crash, and it is not readable by
    // other processes/root via the filesystem.
    if (params.privateKey) {
      options.privateKey = params.privateKey;
    }
    if (params.password) {
      options.password = params.password;
    }
    if (params.expectedHostKey) {
      options.hostVerifier = this.buildHostVerifier(params.expectedHostKey);
    }

    await client.connect(options);

    return {
      client,
      dispose: () => {
        client.dispose();
        return Promise.resolve();
      },
    };
  }

  async exec(conn: SshConnection, command: string): Promise<SshExecResult> {
    const result = await conn.client.execCommand(command);
    return { stdout: result.stdout, stderr: result.stderr, code: result.code };
  }

  async putContent(
    conn: SshConnection,
    remotePath: string,
    content: string,
  ): Promise<void> {
    const sq = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
    const dir = remotePath.substring(0, remotePath.lastIndexOf('/'));
    if (dir) {
      await conn.client.execCommand(`mkdir -p ${sq(dir)}`);
    }
    const result = await conn.client.execCommand(`cat > ${sq(remotePath)}`, {
      stdin: content,
    });
    if (result.code !== 0) {
      throw new Error(
        `putContent to ${remotePath} failed (exit ${String(result.code)}): ${result.stderr || result.stdout || 'unknown error'}`,
      );
    }
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
