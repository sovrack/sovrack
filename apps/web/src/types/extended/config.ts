import type { components } from '@/generated/api-contract';

type ApiSchema = components['schemas'];

export type Config = {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateConfigPayload = ApiSchema['CreateConfigDto'];
export type UpdateConfigPayload = ApiSchema['UpdateConfigDto'];

export type EnvConfig = {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  environmentId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

export type UpsertEnvConfigPayload = {
  key: string;
  value: string;
  isSecret?: boolean;
};
