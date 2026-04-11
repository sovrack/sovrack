export type DeploymentStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELED';

export type Deployment = {
  id: string;
  status: DeploymentStatus;
  branch: string;
  logs: string | null;
  dockerImage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  project: {
    id: string;
    name: string;
  };
  environment: {
    id: string;
    name: string;
  };
  user: {
    id: string;
    fullName: string;
    email: string;
  };
};

export type CreateDeploymentPayload = {
  projectId: string;
  environmentId: string;
  branch?: string;
};

export type LogLevel = 'info' | 'error' | 'success';

export type LogLine = {
  timestamp: string;
  message: string;
  level: LogLevel;
};

export type DeploymentLogEvent = {
  message: string;
  timestamp: string;
  deploymentId?: string;
  level?: LogLevel;
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

export type SocketDeploymentEvent =
  | { type: 'deployment:log'; payload: DeploymentLogEvent }
  | { type: 'deployment:status'; payload: DeploymentStatusEvent }
  | { type: 'deployment:finished'; payload: DeploymentFinishedEvent };
