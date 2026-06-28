import type { components } from '@/generated/api-contract';

type ApiSchema = components['schemas'];

export type ServiceEnvironment = {
  id: string;
  serviceId: string;
  environmentId: string;
  env: Record<string, string> | null;
  autoDeploy?: boolean;
  autoBranch?: string | null;
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

// Request payloads derived from the backend contract. `serviceId` is provided by
// the URL (route param), not the request body, so it is omitted here.
export type CreateServiceEnvironmentPayload = Omit<
  ApiSchema['CreateServiceEnvironmentDto'],
  'serviceId'
>;
export type UpdateServiceEnvironmentPayload = Omit<
  ApiSchema['UpdateServiceEnvironmentDto'],
  'serviceId'
>;

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
