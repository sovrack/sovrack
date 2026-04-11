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
