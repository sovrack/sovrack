export type PlatformConfigItem = {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UpdatePlatformConfigPayload = {
  value: string;
  isSecret?: boolean;
};

export type GitlabTestResult = {
  ok: boolean;
  message: string;
};

export type GitProviderStatus =
  | 'NOT_CONFIGURED'
  | 'ACTION_REQUIRED'
  | 'CONFIGURED';

export type GitProviderType = 'GITLAB' | 'GITHUB';

export type GitlabProvider = {
  id: string;
  name: string;
  type: 'GITLAB';
  providerType?: GitProviderType;
  gitlabUrl: string;
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
  gitlabUrl: string;
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

export type CreateRegistryConfigPayload = {
  name: string;
  type: RegistryProviderType;
  username?: string;
  password?: string;
  registryUrl?: string;
  isDefault?: boolean;
};

export type UpdateRegistryConfigPayload = Partial<CreateRegistryConfigPayload>;

export type RegistryTestResult = {
  ok: boolean;
  message: string;
};
