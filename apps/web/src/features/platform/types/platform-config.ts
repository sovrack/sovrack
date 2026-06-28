import type { components } from '@/generated/api-contract';

type ApiSchema = components['schemas'];

export type PlatformConfigItem = {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  createdAt: string;
  updatedAt: string;
};

// Request payload derived from the backend contract.
export type UpdatePlatformConfigPayload = ApiSchema['UpdatePlatformConfigDto'];

export type GitlabTestResult = {
  ok: boolean;
  message: string;
};

export type GitProviderStatus =
  | 'NOT_CONFIGURED'
  | 'ACTION_REQUIRED'
  | 'CONFIGURED';

export type GitProviderType = 'GITLAB' | 'GITHUB' | 'GITEA';

export type GitlabProvider = {
  id: string;
  name: string;
  type: 'GITLAB';
  providerType?: GitProviderType;
  // Canonical name matching the backend GitProviderConfig.providerUrl field.
  providerUrl: string;
  internalUrl: string;
  redirectUri: string;
  applicationId: string;
  applicationSecretConfigured: boolean;
  groupNames: string;
  adminTokenConfigured: boolean;
  oauthTokenConfigured: boolean;
  oauthExpiresAt: string | null;
  status: GitProviderStatus;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateGitlabProviderPayload = {
  name: string;
  // Canonical name matching the backend GitProviderConfig.providerUrl field.
  providerUrl: string;
  internalUrl?: string;
  redirectUri?: string;
  applicationId?: string;
  applicationSecret?: string;
  groupNames?: string;
  adminToken?: string;
  isDefault?: boolean;
};

export type UpdateGitlabProviderPayload = Partial<CreateGitlabProviderPayload>;

export type GitlabOAuthStartResult = {
  providerId: string;
  authorizeUrl: string;
  redirectUri: string;
  stateExpiresAt: string;
};

export type RegistryProviderType =
  | 'DOCKER_HUB'
  | 'DOCKER_REGISTRY'
  | 'GITLAB'
  | 'ECR'
  | 'GCR';

export type RegistryConfig = {
  id: string;
  name: string;
  type: RegistryProviderType;
  username: string;
  registryUrl: string;
  isDefault: boolean;
  isConnected: boolean;
  connectionError: string | null;
  createdAt: string;
  updatedAt: string;
};

// Derived from the backend contract (the `type` enum is now carried by the
// contract — RegistryProviderType Prisma enum — so it stays precise).
export type CreateRegistryConfigPayload = ApiSchema['CreateRegistryConfigDto'];
export type UpdateRegistryConfigPayload = ApiSchema['UpdateRegistryConfigDto'];

export type RegistryTestResult = {
  ok: boolean;
  message: string;
};
