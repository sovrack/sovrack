export type ServerStatus =
  | 'NEW'
  | 'SSH_PENDING'
  | 'SSH_VALIDATED'
  | 'VALIDATION_FAILED'
  | 'INFO_DETECTED'
  | 'PREPARATION_PENDING'
  | 'PREPARING'
  | 'PREPARED'
  | 'PARTIALLY_PREPARED'
  | 'PREPARATION_FAILED'
  | 'UNREACHABLE'
  | 'DISABLED';

export type ServerPreparationStatus =
  | 'QUEUED'
  | 'RESOLVING_OPTIONS'
  | 'WAITING_FOR_LOCK'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'PARTIAL'
  | 'FAILED'
  | 'TIMEOUT'
  | 'CANCELED';

export type ServerPreparationTaskStatus =
  | 'PENDING'
  | 'SKIPPED'
  | 'RUNNING'
  | 'OK'
  | 'CHANGED'
  | 'FAILED'
  | 'TIMEOUT';

export type ServerPreparationProfile =
  | 'BASIC'
  | 'WEB'
  | 'DATABASE'
  | 'RUNNER'
  | 'FULL'
  | 'CUSTOM';

export type ServerConnectionMode = 'ssh';

export type Server = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  sshPublicKey?: string | null;
  connectionMode: ServerConnectionMode;
  isActive: boolean;
  isVerified: boolean;
  status: ServerStatus;
  verificationError?: string | null;
  lastVerifiedAt?: string | null;
  lastDetectedAt?: string | null;
  lastPreparedAt?: string | null;
  onboardingStep: string;
  hasDocker: boolean;
  hasRunner: boolean;
  createdAt: string;
  updatedAt: string;
  description?: string;
};

export type CreateServerPayload = {
  name: string;
  host: string;
  port?: number;
  username?: string;
  sshKey?: string;
  sshKeyId?: string;
  connectionMode?: ServerConnectionMode;
  verificationMode?: 'manual' | 'ssh';
  description?: string;
};

export type CreateServerResult = Server & {
  agentBootstrapToken?: string;
};

export type UpdateServerPayload = Partial<
  Pick<
    Server,
    | 'name'
    | 'host'
    | 'port'
    | 'username'
    | 'isActive'
    | 'isVerified'
    | 'hasDocker'
    | 'hasRunner'
  >
> & {
  sshKey?: string;
  connectionMode?: ServerConnectionMode;
  description?: string;
};

export type InstallToolsPayload = {
  docker?: boolean;
  ansible?: boolean;
  runner?: boolean;
};

export type StartServerPreparationPayload = {
  profile?: ServerPreparationProfile;
  systemUpdate?: boolean;
  docker?: boolean;
  dockerComposePlugin?: boolean;
  nginx?: boolean;
  nodejs?: boolean;
  postgres?: boolean;
  postgresql?: boolean;
  redis?: boolean;
  gitlabRunner?: boolean;
  firewall?: boolean;
  fail2ban?: boolean;
  certbot?: boolean;
  ssl?: boolean;
  swap?: boolean;
  monitoring?: boolean;
  backup?: boolean;
  logrotate?: boolean;
  securityHardening?: boolean;
  autoUpdates?: boolean;
  gitlabRunnerExecutor?: string;
};

export type RegisterRunnerPayload = {
  gitlabUrl: string;
  token: string;
};

export type InstallServerKeyPayload = {
  password: string;
};

export type InstallServerKeyResult = {
  success: boolean;
  message: string;
};

export type ServerJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'TIMEOUT'
  | 'BLOCKED';

export type ServerJobType =
  | 'VERIFY'
  | 'INSTALL_TOOLS'
  | 'PREPARE_SERVER'
  | 'REGISTER_RUNNER';

export type ServerJob = {
  id: string;
  serverId: string;
  type: ServerJobType;
  status: ServerJobStatus;
  output?: string | null;
  error?: string | null;
  attempts: number;
  maxAttempts: number;
  timeoutMs: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ServerCapability = {
  id: string;
  serverId: string;
  key: string;
  value: string;
  source: string;
  detectedAt: string;
};

export type ServerInstalledTool = {
  id: string;
  serverId: string;
  toolKey: string;
  displayName: string;
  version?: string | null;
  installedBy?: string | null;
  status: 'INSTALLED' | 'MISSING' | 'FAILED' | 'UNKNOWN';
  installedAt?: string | null;
};

export type ServerValidationResult = {
  id: string;
  serverId: string;
  sshReachable: boolean;
  authSucceeded: boolean;
  sudoAvailable: boolean;
  fingerprint?: string | null;
  osName?: string | null;
  osVersion?: string | null;
  architecture?: string | null;
  pythonAvailable: boolean;
  validationMessage?: string | null;
  validatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ServerPreparationTask = {
  id: string;
  preparationId: string;
  roleKey: string;
  taskName: string;
  orderIndex: number;
  status: ServerPreparationTaskStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  message?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ServerPreparation = {
  id: string;
  serverId: string;
  status: ServerPreparationStatus;
  profile: ServerPreparationProfile;
  triggerSource: string;
  requestedById?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  selectedOptionsJson?: Record<string, unknown>;
  resolvedRolesJson?: string[];
  summary?: string | null;
  errorMessage?: string | null;
  retryOfPreparationId?: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: ServerPreparationTask[];
};

export type ServerPreparationLog = {
  id: string;
  preparationId: string;
  level: 'INFO' | 'WARNING' | 'ERROR';
  source: string;
  message: string;
  lineNumber: number;
  createdAt: string;
};

export type ServerPreparationReadiness = {
  serverId: string;
  isReady: boolean;
  checks: {
    serverActive: boolean;
    serverNotDisabled: boolean;
    sshValidated: boolean;
    sshReachable: boolean;
    authSucceeded: boolean;
    sudoAvailable: boolean;
    noActivePreparation: boolean;
  };
  blockingReasons: string[];
  latestValidationAt?: string | null;
};

export type ServerAuditEvent = {
  id: string;
  serverId: string;
  actorId?: string | null;
  eventType: string;
  payloadJson?: Record<string, unknown> | null;
  createdAt: string;
};

export type PreparationOptionDefinition = {
  key: keyof StartServerPreparationPayload;
  label: string;
  description: string;
  role: string | null;
  dependencies: string[];
  recommended: boolean;
};

export type ServerPreparationOptionsResponse = {
  controlNodeOnly: boolean;
  message: string;
  profiles: ServerPreparationProfile[];
  options: PreparationOptionDefinition[];
  profileDefaults: Record<
    ServerPreparationProfile,
    Partial<Record<PreparationOptionDefinition['key'], boolean>>
  >;
};

export type VerifyServerResult = Server;
