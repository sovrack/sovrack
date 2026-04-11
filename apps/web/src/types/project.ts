export type ProjectRole = 'OWNER' | 'MEMBER';

export type UserRole = 'ADMIN' | 'DEVELOPER';
export type GitlabSourceType = 'REPO' | 'GROUP';

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
  deployTokenUsername: string | null;
  registryUrl: string | null;
  gitlabToken: string;
  deployTokenValue: string;
  webhookSecret: string | null;
};

export type ProjectListItem = {
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
  memberCount: number;
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
};

export type CreateProjectPayload = {
  name: string;
  description?: string;
  gitlabUrl: string;
  branch?: string;
  ownerId?: string;
};

export type UpdateProjectPayload = Partial<CreateProjectPayload>;

export type AddMemberPayload = {
  email: string;
  role: ProjectRole;
};

export type ConnectGitlabPayload = {
  gitlabUrl: string;
  gitlabToken: string;
  gitlabId?: number;
  defaultBranch?: string;
  sourceType?: GitlabSourceType;
  gitlabGroupId?: number;
  deployTokenUsername?: string;
  deployTokenValue?: string;
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
  path_with_namespace?: string;
  web_url?: string;
};
