import type { Server } from './server';

export type EnvName = 'STAGING' | 'PRODUCTION';

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
  createdAt: string;
  updatedAt: string;
};

export type CreateEnvironmentPayload = {
  name: EnvName;
  serverId: string;
  domain?: string;
};

export type UpdateEnvironmentPayload = Partial<CreateEnvironmentPayload> & {
  autoDeploy?: boolean;
  autoDeployBranch?: string;
};
