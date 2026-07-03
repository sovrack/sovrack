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

/**
 * Port (contrat) du primitif Ansible bas-niveau de la plateforme.
 *
 * Les consommateurs (infrastructure/onboarding, networking/ssl…) dépendent
 * de cette abstraction via le token {@link ANSIBLE_RUNNER}, jamais forcément
 * de l'implémentation concrète — même pattern que {@link ISshExecutor}
 * (ports/ssh-executor.port.ts) et {@link IDockerRuntime}
 * (ports/docker-runtime.port.ts). Permet de substituer l'implémentation
 * (ex. futur agent serveur Go en mode hybride) sans toucher aux appelants.
 */
export interface IAnsibleRunner {
  run(
    input: AnsibleRunInput,
    options: AnsibleRunOptions,
    callbacks?: AnsibleRunCallbacks,
  ): Promise<void>;
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
  ): string;
  resolvePlaybookBin(): string;
  resolvePlaybooksRoot(): string;
  resolveAnsibleConfigPath(playbooks?: string): string | undefined;
  runPlaybook(
    args: string[],
    context: {
      cwd?: string;
      ansibleConfigPath?: string;
      extraEnv?: Record<string, string>;
    },
    options: AnsibleRunOptions,
    callbacks?: AnsibleRunCallbacks,
  ): Promise<string>;
}

/** Token DI pour injecter {@link IAnsibleRunner}. */
export const ANSIBLE_RUNNER = Symbol('ANSIBLE_RUNNER');
