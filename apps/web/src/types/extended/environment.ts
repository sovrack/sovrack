import type { ServiceLink } from './service-environment';

export type EnvName = 'STAGING' | 'PRODUCTION' | 'TESTING' | 'PREVIEW';

export type Environment = {
  id: string;
  name: EnvName;
  projectId: string;
  env: string | null;
  serviceLinks?: ServiceLink[];
  servers?: { id: string; name: string; host: string }[];
  createdAt: string;
  updatedAt: string;
};

export type CreateEnvironmentPayload = {
  name: string;
  env?: string;
};

export type UpdateEnvironmentPayload = {
  name?: string;
  env?: string;
};
