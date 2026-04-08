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
  gitlabId: string;
  defaultBranch: string;
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  gitlabUrl: string | null;
  gitlabId: string | null;
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
  members: ProjectMember[];
  gitlabConfig: GitlabConfig | null;
  _count?: {
    deployments: number;
    environments: number;
  };
};

export type CreateProjectPayload = {
  name: string;
  description?: string;
  gitlabUrl?: string;
  defaultBranch?: string;
};

export type UpdateProjectPayload = Partial<CreateProjectPayload>;

export type AddMemberPayload = {
  email: string;
  role: ProjectRole;
};

export type ConnectGitlabPayload = {
  gitlabUrl: string;
  token: string;
  gitlabId: string;
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
