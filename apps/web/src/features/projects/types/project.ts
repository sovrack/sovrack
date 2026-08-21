import type { components } from "@/generated/api-contract";
import type { UserRole } from "@/features/auth";
import type { ServiceType } from "./service";

type ApiSchema = components["schemas"];

export type ProjectRole = "MAINTAINER" | "DEVELOPER" | "VIEWER";

export type { UserRole };
export type GitlabGroupImportMode = "ONE_APPLICATION" | "SEPARATE_PROJECTS";
export type GitlabSourceType = "REPO" | "GROUP";

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

// Provider-agnostic source provider (GitHub + GitLab) for the unified picker.
export type SourceProviderOption = {
  id: string;
  name: string;
  type: "GITLAB" | "GITHUB";
  url: string;
  isDefault: boolean;
  status: "NOT_CONFIGURED" | "ACTION_REQUIRED" | "CONFIGURED";
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
  // Multi-tenant cap on simultaneous in-flight deployments (null = unlimited).
  maxConcurrentDeploys: number | null;
  createdAt: string;
  updatedAt: string;
  members: ProjectMember[];
};

export type CreateProjectPayload = Omit<
  ApiSchema["CreateProjectDto"],
  "gitlabGroupId"
> & {
  gitlabGroupId?: number | string;
};

export type UpdateProjectPayload = Partial<CreateProjectPayload> &
  ApiSchema["UpdateProjectDto"];

export type AddMemberPayload = Omit<ApiSchema["AddMemberDto"], "role"> & {
  email: string;
  role: ProjectRole;
};

export type ConnectSourcePayload = {
  provider: "GITLAB" | "GITHUB";
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
