import type { components } from '@/generated/api-contract';
import type { UserRole } from './auth';

type ApiSchema = components['schemas'];

export type ProjectRole = 'OWNER' | 'DEVELOPER' | 'VIEWER';

export type { UserRole };
export type GitlabSourceType = NonNullable<ApiSchema['CreateProjectDto']['sourceType']>;
export type GitlabGroupImportMode = 'ONE_APPLICATION' | 'SEPARATE_PROJECTS';
export type ProjectServiceType =
  | 'FRONTEND'
  | 'BACKEND'
  | 'WORKER'
  | 'DATABASE'
  | 'STATIC'
  | 'API'
  | 'OTHER';
export type BuildStrategy =
  | 'DOCKERFILE'
  | 'DOCKER_COMPOSE'
  | 'BUILDPACK'
  | 'STATIC'
  | 'NONE';

export type ProjectMemberUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
};

export type ProjectMember = {
  id: string;
  role: ProjectRole;
  joinedAt: string;
  user: ProjectMemberUser;
};

export type GitlabConfig = {
  id: string;
  gitlabUrl: string;
  gitlabId: number | null;
  defaultBranch: string;
  sourceType: GitlabSourceType;
  gitlabGroupId: number | null;
  providerId: string | null;
  deployTokenUsername: string | null;
  registryUrl: string | null;
  gitlabToken: string;
  deployTokenValue: string;
  webhookSecretConfigured: boolean;
};

export type GitlabProviderOption = {
  id: string;
  name: string;
  gitlabUrl: string;
  isDefault: boolean;
  status: 'NOT_CONFIGURED' | 'ACTION_REQUIRED' | 'CONFIGURED';
};

export type ProjectListItem = {
  id: string;
  name: string;
  description: string | null;
  gitlabUrl: string | null;
  gitlabId: number | null;
  gitlabSourceType: GitlabSourceType | null;
  gitlabGroupId: number | null;
  hasGitlabConfig: boolean;
  branch: string;
  dockerfile: string;
  port: number;
  environmentCount: number;
  serviceCount?: number;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  currentUserProjectRole: ProjectRole | null;
};

export type ProjectDetail = {
  id: string;
  name: string;
  description: string | null;
  gitlabUrl: string | null;
  gitlabId: number | null;
  branch: string;
  dockerfile: string;
  port: number;
  createdAt: string;
  updatedAt: string;
  members: ProjectMember[];
  services?: ProjectService[];
};

export type CreateProjectPayload = Omit<ApiSchema['CreateProjectDto'], 'gitlabGroupId'> & {
  gitlabGroupId?: number | string;
};

export type UpdateProjectPayload = Partial<CreateProjectPayload> & ApiSchema['UpdateProjectDto'];

export type AddMemberPayload = Omit<ApiSchema['AddMemberDto'], 'role'> & {
  email: string;
  role: ProjectRole;
};

export type ConnectGitlabPayload = Omit<ApiSchema['ConnectGitlabDto'], 'gitlabGroupId'> & {
  gitlabGroupId?: number | string;
};

export type GitlabBranch = {
  name: string;
  default: boolean;
};

export type GitlabPipeline = {
  id: number;
  status: string;
  ref: string;
  sha: string;
  web_url: string;
  created_at: string;
};

export type GitlabRepo = {
  id: number;
  name: string;
  path?: string;
  path_with_namespace?: string;
  pathWithNamespace?: string;
  default_branch?: string | null;
  defaultBranch?: string | null;
  web_url?: string;
  webUrl?: string;
  description?: string | null;
  last_activity_at?: string | null;
  lastActivityAt?: string | null;
  visibility?: string;
  language?: string | null;
  archived?: boolean;
};

export type GitlabGroupRepositoriesResponse = {
  items: GitlabRepo[];
  pagination: {
    page: number;
    perPage: number;
    total: number | null;
    totalPages: number | null;
  };
};

export type ImportGitlabGroupRepositoryPayload = {
  id: number;
  name: string;
  pathWithNamespace: string;
  defaultBranch: string;
  serviceName?: string;
  serviceType?: ProjectServiceType;
};

export type ImportGitlabGroupPayload = {
  name: string;
  description?: string;
  providerId?: string;
  gitlabUrl?: string;
  gitlabToken?: string;
  groupId: string;
  importMode: GitlabGroupImportMode;
  repositories: ImportGitlabGroupRepositoryPayload[];
  ownerId?: string;
};

export type ProjectService = {
  id: string;
  projectId: string;
  name: string;
  type: ProjectServiceType;
  sourceProviderId: string | null;
  gitlabProjectId: number | string | null;
  repositoryPath: string | null;
  defaultBranch: string;
  buildStrategy: BuildStrategy;
  dockerfilePath: string;
  composeServiceName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateProjectServicePayload = {
  name: string;
  type?: ProjectServiceType;
  sourceProviderId?: string;
  gitlabProjectId?: number;
  repositoryPath?: string;
  defaultBranch?: string;
  buildStrategy?: BuildStrategy;
  dockerfilePath?: string;
  composeServiceName?: string;
};
