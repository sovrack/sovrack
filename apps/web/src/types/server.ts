export type ServerVerificationMode = 'manual' | 'ssh';
export type ServerConnectionMode = 'ssh' | 'bastion' | 'agent';

export type ServerJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'TIMEOUT'
  | 'BLOCKED'
  | 'AGENT_PENDING';

export type ServerJobType = 'VERIFY' | 'INSTALL_TOOLS' | 'REGISTER_RUNNER';

export type ServerJob = {
  id: string;
  serverId: string;
  type: ServerJobType;
  status: ServerJobStatus;
  output: string | null;
  error: string | null;
  attempts: number;
  maxAttempts: number;
  timeoutMs: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Server = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  connectionMode: ServerConnectionMode;
  bastionHost: string | null;
  bastionPort: number | null;
  bastionUsername: string | null;
  agentLastSeenAt: string | null;
  isActive: boolean;
  isVerified: boolean;
  hasDocker: boolean;
  hasAnsible: boolean;
  hasRunner: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateServerPayload = {
  name: string;
  host: string;
  port?: number;
  username?: string;
  sshKey?: string;
  verificationMode?: ServerVerificationMode;
  connectionMode?: ServerConnectionMode;
  bastionHost?: string;
  bastionPort?: number;
  bastionUsername?: string;
  bastionSshKey?: string;
};

export type UpdateServerPayload = Partial<{
  name: string;
  host: string;
  port: number;
  username: string;
  sshKey: string;
  connectionMode: ServerConnectionMode;
  bastionHost: string;
  bastionPort: number;
  bastionUsername: string;
  bastionSshKey: string;
  isActive: boolean;
  isVerified: boolean;
  hasDocker: boolean;
  hasAnsible: boolean;
  hasRunner: boolean;
}>;

export type VerifyServerResult = {
  isVerified: boolean;
  hasDocker: boolean;
  hasAnsible: boolean;
  hasRunner: boolean;
};

export type InstallToolsPayload = {
  docker?: boolean;
  ansible?: boolean;
  runner?: boolean;
};

export type RegisterRunnerPayload = {
  gitlabUrl: string;
  token: string;
};

export type ServerInstallResult = {
  success: boolean;
  message: string;
  hasDocker: boolean;
  hasAnsible: boolean;
  hasRunner: boolean;
};

export type ServerVerifyResult = {
  success: boolean;
  message: string;
  isVerified: boolean;
  hasDocker: boolean;
  hasAnsible: boolean;
};
