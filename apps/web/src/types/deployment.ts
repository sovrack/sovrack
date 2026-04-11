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
    gitlabUrl?: string;
  };
  environment: {
    id: string;
    name: string;
    server?: {
      id: string;
      name: string;
      host: string;
    };
  };
  user: {
    id: string;
    fullName: string;
    email: string;
    name?: string;
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

export type SocketDeploymentEvent =
  | { type: 'deployment:started'; payload: DeploymentStartedEvent }
  | { type: 'deployment:log'; payload: DeploymentLogEvent }
  | { type: 'deployment:status'; payload: DeploymentStatusEvent }
  | { type: 'deployment:finished'; payload: DeploymentFinishedEvent };
