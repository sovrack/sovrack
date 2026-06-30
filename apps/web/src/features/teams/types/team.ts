import type { components } from "@/generated/api-contract";
import type { UserRole } from "@/features/auth";

type ApiSchema = components["schemas"];

export type TeamMemberUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TeamMember = {
  id: string;
  teamId: string;
  userId: string;
  joinedAt: string;
  user: TeamMemberUser;
};

export type Team = {
  id: string;
  name: string;
  description: string | null;
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
};

// Request payloads derived from the backend contract (single source of truth).
export type CreateTeamPayload = ApiSchema["CreateTeamDto"];
export type UpdateTeamPayload = ApiSchema["UpdateTeamDto"];
export type AddTeamMemberPayload = ApiSchema["AddTeamMemberDto"];
