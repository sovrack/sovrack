import type {
  CreateDeploymentApiPayload,
  DeploymentApi,
  DeploymentMutationApi,
} from './api-contract';

export type Deployment = DeploymentApi;
export type DeploymentMutation = DeploymentMutationApi;
export type DeploymentStatus = Deployment['status'];
export type CreateDeploymentPayload = CreateDeploymentApiPayload;

export type LogLevel = 'info' | 'error' | 'success';

export type LogLine = {
  timestamp: string;
  message: string;
  level: LogLevel;
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
