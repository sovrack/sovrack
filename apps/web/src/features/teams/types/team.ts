export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER";
export type WorkspaceType = "PERSONAL" | "ORGANIZATION";
export type WorkspaceStatus =
  "ACTIVE" | "SUSPENDED" | "ARCHIVED" | "DELETION_PENDING";

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
  canManageBilling: boolean;
  joinedAt: string;
  user: TeamMemberUser;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: WorkspaceType;
  status: WorkspaceStatus;
  role: WorkspaceRole;
  membershipStatus: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  updatedAt: string;
};

export type Team = Omit<WorkspaceSummary, "role" | "membershipStatus"> & {
  members: TeamMember[];
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
  deliveryStatus: "PENDING" | "SENT" | "FAILED";
  deliveryAttempts: number;
  deliveredAt: string | null;
  lastDeliveryAttemptAt: string | null;
  invitedByEmail: string;
  invitedByName: string;
  expiresAt: string;
  createdAt: string;
};
