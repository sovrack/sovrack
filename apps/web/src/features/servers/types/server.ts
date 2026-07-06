import type { components } from "@/generated/api-contract";

type ApiSchema = components["schemas"];

type ServerInstalledToolApi = ApiSchema["ServerInstalledToolDto"];
type ServerValidationResultApi = ApiSchema["ServerValidationResultDto"];
type ServerSetupTaskApi = ApiSchema["ServerSetupTaskDto"];
type ServerSetupApi = ApiSchema["ServerSetupDto"];
type ServerAuditEventApi = ApiSchema["ServerAuditEventDto"];

export type ServerStatus = ApiSchema["ServerResponseDto"]["status"];
export type ServerSetupStatus =
  ApiSchema["ServerSetupDto"]["status"];
export type ServerSetupTaskStatus =
  ApiSchema["ServerSetupTaskDto"]["status"];
export type ServerPreparationProfile = NonNullable<
  ApiSchema["StartServerSetupDto"]["profile"]
>;
export type ServerConnectionMode =
  ApiSchema["ServerResponseDto"]["connectionMode"];

export type ServerInfraRole =
  "NONE" | "STAGING" | "PRODUCTION" | "DATABASE" | "RUNNER" | "MONITORING";

export type ServerActiveJob = ApiSchema["ServerActiveJobDto"];

export type Server = ApiSchema["ServerResponseDto"] & {
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

export type CreateServerPayload = ApiSchema["CreateServerDto"] & {
  description?: string;
};

export type CreateServerResult = ApiSchema["CreateServerResponseDto"] & {
  infraRole?: ServerInfraRole;
  description?: string;
};

export type UpdateServerPayload = ApiSchema["UpdateServerDto"] & {
  description?: string;
};

export type InstallToolsPayload = Record<string, unknown>;

export type StartServerSetupPayload =
  ApiSchema["StartServerSetupDto"] & {
    reinstallOptions?: string[];
  };

export type RegisterRunnerPayload = ApiSchema["RegisterRunnerDto"];

export type InstallServerKeyPayload = ApiSchema["InstallKeyDto"];

export type InstallServerKeyResult = ApiSchema["InstallKeyResponseDto"];

export type ServerJobStatus = ApiSchema["ServerJobResponseDto"]["status"];

export type ServerJobType = ApiSchema["ServerJobResponseDto"]["type"];

export type ServerJob = ApiSchema["ServerJobResponseDto"];

export type ServerCapability = ApiSchema["ServerCapabilityDto"];

export type ServerInstalledTool = Omit<
  ServerInstalledToolApi,
  "version" | "installedBy" | "installedAt"
> & {
  version?: string | null;
  installedBy?: string | null;
  installedAt?: string | null;
};

export type ServerValidationResult = Omit<
  ServerValidationResultApi,
  | "fingerprint"
  | "osName"
  | "osVersion"
  | "architecture"
  | "validationMessage"
  | "validatedAt"
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

export type ServerSetupTask = Omit<
  ServerSetupTaskApi,
  "startedAt" | "finishedAt" | "message"
> & {
  startedAt?: string | null;
  finishedAt?: string | null;
  message?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ServerSetup = Omit<
  ServerSetupApi,
  | "startedAt"
  | "finishedAt"
  | "summary"
  | "errorMessage"
  | "retryOfSetupId"
  | "tasks"
> & {
  startedAt?: string | null;
  finishedAt?: string | null;
  summary?: string | null;
  errorMessage?: string | null;
  retryOfSetupId?: string | null;
  selectedOptionsJson?: Record<string, unknown>;
  resolvedRolesJson?: string[];
  createdAt: string;
  updatedAt: string;
  tasks: ServerSetupTask[];
};

export type ServerSetupLog = ApiSchema["ServerSetupLogDto"];

export type ServerSetupReadiness =
  ApiSchema["ServerSetupReadinessDto"];

export type ServerAuditEvent = Omit<
  ServerAuditEventApi,
  "actorId" | "payloadJson"
> & {
  actorId?: string | null;
  payloadJson?: Record<string, unknown> | null;
};

export type SetupOptionDefinition = {
  key: keyof StartServerSetupPayload;
  label: string;
  description: string;
  role: string | null;
  dependencies: string[];
  recommended: boolean;
};

export type ServerSetupOptionsResponse = {
  controlNodeOnly: boolean;
  message: string;
  profiles: ServerPreparationProfile[];
  options: SetupOptionDefinition[];
  profileDefaults: Record<
    ServerPreparationProfile,
    Partial<Record<SetupOptionDefinition["key"], boolean>>
  >;
};

export type VerifyServerResult = Server;
