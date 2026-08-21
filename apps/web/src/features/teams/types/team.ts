export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER";

export type TeamMemberUser = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TeamMember = {
  id: string;
  teamId: string;
  userId: string;
  role: WorkspaceRole;
  status: "ACTIVE" | "SUSPENDED";
  joinedAt: string;
  user: TeamMemberUser;
};

export type Team = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
};

export type CreateTeamPayload = { name: string; description?: string };
export type UpdateTeamPayload = { name?: string; description?: string };
export type AddTeamMemberPayload = {
  userId: string;
  role?: WorkspaceRole;
};

export type WorkspaceInvitation = {
  id: string;
  teamId: string;
  email: string;
  role: WorkspaceRole;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
};
