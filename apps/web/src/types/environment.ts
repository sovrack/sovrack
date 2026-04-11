import type { Server } from './server';

export type EnvName = 'STAGING' | 'PRODUCTION';

export type Environment = {
  id: string;
  name: EnvName;
  domain: string | null;
  isActive: boolean;
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

export type UpdateEnvironmentPayload = Partial<CreateEnvironmentPayload>;
