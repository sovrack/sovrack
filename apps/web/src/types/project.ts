export type ProjectRole = 'OWNER' | 'MEMBER';

export type UserRole = 'ADMIN' | 'DEVELOPER';

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
  gitlabId: number;
  defaultBranch: string;
  gitlabToken: string;
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
};

export type UpdateProjectPayload = Partial<CreateProjectPayload>;

export type AddMemberPayload = {
  email: string;
  role: ProjectRole;
};

export type ConnectGitlabPayload = {
  gitlabUrl: string;
  gitlabToken: string;
  gitlabId: number;
  defaultBranch?: string;
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
