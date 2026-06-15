import type { components } from '@/generated/api-contract';
import type { UserRole } from './auth';
import type { ServiceType } from './service';

type ApiSchema = components['schemas'];

export type ProjectRole = 'OWNER' | 'DEVELOPER' | 'VIEWER';

export type { UserRole };
export type GitlabGroupImportMode = 'ONE_APPLICATION' | 'SEPARATE_PROJECTS';
export type GitlabSourceType = 'REPO' | 'GROUP';

export type GitlabConfig = {
  id: string;
  gitlabUrl: string;
  gitlabId: number | null;
  gitlabGroupId: number | null;
  defaultBranch: string;
  sourceType: string;
  providerId: string | null;
  deployTokenUsername: string | null;
  registryUrl: string | null;
  gitlabToken: string;
  deployTokenValue: string;
  webhookSecretConfigured: boolean;
};

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

export type GitlabProviderOption = {
  id: string;
  name: string;
  gitlabUrl: string;
  isDefault: boolean;
  status: 'NOT_CONFIGURED' | 'ACTION_REQUIRED' | 'CONFIGURED';
};

// Provider-agnostic source provider (GitHub + GitLab) for the unified picker.
export type SourceProviderOption = {
  id: string;
  name: string;
  type: 'GITLAB' | 'GITHUB';
  url: string;
  isDefault: boolean;
  status: 'NOT_CONFIGURED' | 'ACTION_REQUIRED' | 'CONFIGURED';
};

export type ProjectListItem = {
  id: string;
  name: string;
  description: string | null;
  env: string | null;
  hasGitlabConfig: boolean;
  environmentCount: number;
  serviceCount: number;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  currentUserProjectRole: ProjectRole | null;
};

export type ProjectDetail = {
  id: string;
  name: string;
  description: string | null;
  env: string | null;
  createdAt: string;
  updatedAt: string;
  members: ProjectMember[];
};

export type CreateProjectPayload = Omit<ApiSchema['CreateProjectDto'], 'gitlabGroupId'> & {
  gitlabGroupId?: number | string;
};

export type UpdateProjectPayload = Partial<CreateProjectPayload> & ApiSchema['UpdateProjectDto'];

export type AddMemberPayload = Omit<ApiSchema['AddMemberDto'], 'role'> & {
  email: string;
  role: ProjectRole;
};

export type ConnectGitlabPayload = {
  gitlabUrl?: string;
  gitlabToken?: string;
  providerId?: string;
  defaultBranch?: string;
  sourceType?: string;
  gitlabId?: number | string;
  gitlabGroupId?: number | string;
  deployTokenUsername?: string;
  deployTokenValue?: string;
  registryUrl?: string;
};

export type ConnectSourcePayload = {
  provider: 'GITLAB' | 'GITHUB';
  repoPath?: string;
  groupPath?: string;
  token?: string;
  defaultBranch?: string;
  sourceType?: string;
  providerId?: string;
  gitlabUrl?: string;
  gitlabToken?: string;
  gitlabId?: number | string;
  gitlabGroupId?: number | string;
  githubToken?: string;
  repoFullName?: string;
  registryUrl?: string;
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
  serviceType?: ServiceType;
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
