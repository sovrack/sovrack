export type ServiceEnvironment = {
  id: string;
  serviceId: string;
  environmentId: string;
  env: Record<string, string> | null;
  service: {
    id: string;
    name: string;
    type: string;
  };
  environment: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type CreateServiceEnvironmentPayload = {
  environmentId: string;
  env?: string;
};

export type UpdateServiceEnvironmentPayload = {
  env?: string;
};

export type ServiceLinkLastDeployment = {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED';
  branch: string | null;
  createdAt: string;
  finishedAt: string | null;
  user: { fullName: string } | null;
};

export type ServiceLink = {
  id: string;
  serviceId: string;
  environmentId: string;
  env: Record<string, string> | null;
  service: {
    id: string;
    name: string;
    type: string;
    env: Record<string, string> | null;
    repoUrl: string | null;
    branch: string | null;
    buildPack?: string | null;
    port?: number | null;
    sourceType?: string | null;
  };
  lastDeployment?: ServiceLinkLastDeployment | null;
};
