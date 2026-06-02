import type { components } from '@/generated/api-contract';
import type { Server } from './server';
import type { ProjectService } from './project';

type ApiSchema = components['schemas'];

type ApiEnvName = ApiSchema['CreateEnvironmentDto']['name'];

export type EnvName = ApiEnvName | 'TESTING' | 'PREVIEW';
export type ServiceDeploymentMode = 'DOCKER' | 'DOCKER_COMPOSE';

export type EnvironmentServiceTarget = {
  id: string;
  environmentId: string;
  serviceId: string;
  serverId: string;
  deploymentMode: ServiceDeploymentMode;
  port: number | null;
  domain: string | null;
  healthcheckPath: string | null;
  replicas: number;
  service?: ProjectService;
  server: Server;
  createdAt: string;
  updatedAt: string;
};

export type Environment = {
  id: string;
  name: EnvName;
  domain: string | null;
  isActive: boolean;
  autoDeploy: boolean;
  autoDeployBranch: string | null;
  projectId: string;
  serverId: string;
  server: Server;
  serviceTargets?: EnvironmentServiceTarget[];
  createdAt: string;
  updatedAt: string;
};

export type CreateEnvironmentPayload = Omit<
  ApiSchema['CreateEnvironmentDto'],
  'name'
> & {
  name: EnvName;
};

export type UpdateEnvironmentPayload = Omit<
  ApiSchema['UpdateEnvironmentDto'],
  'name'
> & {
  name?: EnvName;
};

export type UpsertEnvironmentServiceTargetPayload = {
  serviceId: string;
  serverId: string;
  deploymentMode?: ServiceDeploymentMode;
  port?: number;
  domain?: string;
  healthcheckPath?: string;
  replicas?: number;
};
