import type { components } from '@/generated/api-contract';

type ApiSchema = components['schemas'];
type DeploymentApi = ApiSchema['DeploymentDetailedResponseDto'];
type DeploymentMutationApi = ApiSchema['DeploymentResponseDto'];
type CreateDeploymentApiPayload = ApiSchema['CreateDeploymentDto'];

export type DeploymentServiceTarget = {
  id: string;
  serviceId: string | null;
  port: number | null;
  domain: string | null;
  server: { id: string; name: string; host: string };
};

export type DeploymentServiceSummary = {
  id: string;
  name: string;
  type: string | null;
};

export type Deployment = DeploymentApi & {
  serviceId?: string | null;
  publicUrl?: string | null;
  service?: DeploymentServiceSummary | null;
  environment?: DeploymentApi['environment'] & {
    serviceTargets?: DeploymentServiceTarget[];
  };
};

export type DeploymentMutation = DeploymentMutationApi;
export type DeploymentStatus = Deployment['status'];
export type DeploymentStrategy = 'standard' | 'blue-green';
export type DeploymentBuildMode = 'registry' | 'local' | 'compose';
export type CreateDeploymentPayload = CreateDeploymentApiPayload & {
  serviceId?: string;
  strategy?: DeploymentStrategy;
  buildMode?: DeploymentBuildMode;
  overrideImage?: string;
};

export type LogLevel = 'info' | 'error' | 'success';

export type LogLine = {
  timestamp: string;
  message: string;
  level: LogLevel;
  isReplayed?: boolean;
};

export type DeploymentLogReplayEvent = {
  deploymentId: string;
  logs: DeploymentLogEvent[];
};

export type DeploymentLogEvent = {
  deploymentId: string;
  message: string;
  timestamp: string;
  level?: LogLevel;
};

export type DeploymentStartedEvent = {
  deploymentId: string;
  status?: DeploymentStatus;
};

export type DeploymentStatusEvent = {
  deploymentId: string;
  status: DeploymentStatus;
};

export type DeploymentFinishedEvent = {
  deploymentId: string;
  status: DeploymentStatus;
  finishedAt?: string;
};

export type DeploymentJoinedEvent = {
  deploymentId: string;
};

export type DeploymentErrorEvent = {
  deploymentId?: string;
  message: string;
};

export type SocketDeploymentEvent =
  | { type: 'deployment:started'; payload: DeploymentStartedEvent }
  | { type: 'deployment:log'; payload: DeploymentLogEvent }
  | { type: 'deployment:status'; payload: DeploymentStatusEvent }
  | { type: 'deployment:finished'; payload: DeploymentFinishedEvent }
  | { type: 'deployment:joined'; payload: DeploymentJoinedEvent };
