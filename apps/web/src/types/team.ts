export type TeamMemberUser = {
  id: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'DEVELOPER';
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

export type CreateTeamPayload = {
  name: string;
  description?: string;
};

export type UpdateTeamPayload = Partial<CreateTeamPayload>;

export type AddTeamMemberPayload = {
  userId: string;
};
