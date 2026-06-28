import type { components } from '@/generated/api-contract';

type ApiSchema = components['schemas'];

type ServerInstalledToolApi = ApiSchema['ServerInstalledToolDto'];
type ServerValidationResultApi = ApiSchema['ServerValidationResultDto'];
type ServerPreparationTaskApi = ApiSchema['ServerPreparationTaskDto'];
type ServerPreparationApi = ApiSchema['ServerPreparationDto'];
type ServerAuditEventApi = ApiSchema['ServerAuditEventDto'];

export type ServerStatus = ApiSchema['ServerResponseDto']['status'];
export type ServerPreparationStatus = ApiSchema['ServerPreparationDto']['status'];
export type ServerPreparationTaskStatus = ApiSchema['ServerPreparationTaskDto']['status'];
export type ServerPreparationProfile = NonNullable<ApiSchema['StartServerPreparationDto']['profile']>;
export type ServerConnectionMode = ApiSchema['ServerResponseDto']['connectionMode'];

export type ServerInfraRole =
  | 'NONE'
  | 'STAGING'
  | 'PRODUCTION'
  | 'DATABASE'
  | 'RUNNER'
  | 'MONITORING';

export type ServerActiveJob = ApiSchema['ServerActiveJobDto'];

export type Server = ApiSchema['ServerResponseDto'] & {
  infraRole?: ServerInfraRole;
  description?: string;
};

export type InfraEnvironmentServer = {
  id: string;
  name: string;
  host: string;
  port: number;
  infraRole: ServerInfraRole;
  isVerified: boolean;
  status: ServerStatus;
  hasDocker: boolean;
  hasRunner: boolean;
};

export type CreateServerPayload = ApiSchema['CreateServerDto'] & {
  description?: string;
};

export type CreateServerResult = ApiSchema['CreateServerResponseDto'] & {
  infraRole?: ServerInfraRole;
  description?: string;
};

export type UpdateServerPayload = ApiSchema['UpdateServerDto'] & {
  description?: string;
};

export type InstallToolsPayload = Record<string, unknown>;

export type StartServerPreparationPayload = ApiSchema['StartServerPreparationDto'] & {
  reinstallOptions?: string[];
};

export type RegisterRunnerPayload = ApiSchema['RegisterRunnerDto'];

export type InstallServerKeyPayload = ApiSchema['InstallKeyDto'];

export type InstallServerKeyResult = ApiSchema['InstallKeyResponseDto'];

export type ServerJobStatus = ApiSchema['ServerJobResponseDto']['status'];

export type ServerJobType = ApiSchema['ServerJobResponseDto']['type'];

export type ServerJob = ApiSchema['ServerJobResponseDto'];

export type ServerCapability = ApiSchema['ServerCapabilityDto'];

export type ServerInstalledTool = Omit<
  ServerInstalledToolApi,
  'version' | 'installedBy' | 'installedAt'
> & {
  version?: string | null;
  installedBy?: string | null;
  installedAt?: string | null;
};

export type ServerValidationResult = Omit<
  ServerValidationResultApi,
  | 'fingerprint'
  | 'osName'
  | 'osVersion'
  | 'architecture'
  | 'validationMessage'
  | 'validatedAt'
> & {
  fingerprint?: string | null;
  osName?: string | null;
  osVersion?: string | null;
  architecture?: string | null;
  validationMessage?: string | null;
  validatedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ServerPreparationTask = Omit<
  ServerPreparationTaskApi,
  'startedAt' | 'finishedAt' | 'message'
> & {
  startedAt?: string | null;
  finishedAt?: string | null;
  message?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ServerPreparation = Omit<
  ServerPreparationApi,
  'startedAt' | 'finishedAt' | 'summary' | 'errorMessage' | 'retryOfPreparationId' | 'tasks'
> & {
  startedAt?: string | null;
  finishedAt?: string | null;
  summary?: string | null;
  errorMessage?: string | null;
  retryOfPreparationId?: string | null;
  selectedOptionsJson?: Record<string, unknown>;
  resolvedRolesJson?: string[];
  createdAt: string;
  updatedAt: string;
  tasks: ServerPreparationTask[];
};

export type ServerPreparationLog = ApiSchema['ServerPreparationLogDto'];

export type ServerPreparationReadiness = ApiSchema['ServerPreparationReadinessDto'];

export type ServerAuditEvent = Omit<
  ServerAuditEventApi,
  'actorId' | 'payloadJson'
> & {
  actorId?: string | null;
  payloadJson?: Record<string, unknown> | null;
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
