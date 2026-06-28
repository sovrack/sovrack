import type { NodeSSH } from 'node-ssh';

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
 * Port (contrat) du primitif SSH bas-niveau de la plateforme.
 *
 * Les consommateurs (deployments, servers, preparation…) dépendent de cette
 * abstraction via le token {@link SSH_EXECUTOR}, jamais de l'implémentation
 * concrète. Permet de substituer l'implémentation (ex. futur agent serveur Go
 * en mode hybride) sans toucher aux appelants, et de tester sans vrai SSH.
 */
export interface ISshExecutor {
  connect(params: SshConnectParams): Promise<SshConnection>;
  exec(conn: SshConnection, command: string): Promise<SshExecResult>;
  execOrThrow(
    conn: SshConnection,
    command: string,
    failureMessage: string,
  ): Promise<void>;
  buildHostVerifier(
    expectedKeyBase64: string,
  ): (key: Buffer | string) => boolean;
  withTimeout<T>(
    task: () => Promise<T>,
    timeoutMs: number,
    onTimeout?: () => void,
  ): Promise<T>;
}

/** Token DI pour injecter {@link ISshExecutor}. */
export const SSH_EXECUTOR = Symbol('SSH_EXECUTOR');
