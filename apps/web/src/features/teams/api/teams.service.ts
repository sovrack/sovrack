import api from "@/shared/lib/api";
import type {
  Team,
  CreateTeamPayload,
  UpdateTeamPayload,
  AddTeamMemberPayload,
  WorkspaceInvitation,
  WorkspaceRole,
} from "@/features/teams/types/team";

export const teamsService = {
  /** List the workspaces of the current identity. */
  async getAll(): Promise<Team[]> {
    const res = await api.get<Team[]>("/workspaces");
    return res.data;
  },

  /** Get one authorized workspace. */
  async getById(id: string): Promise<Team> {
    const res = await api.get<Team>(`/workspaces/${id}`);
    return res.data;
  },

  /** Create a new team */
  async create(payload: CreateTeamPayload): Promise<Team> {
    const res = await api.post<Team>("/workspaces", payload);
    return res.data;
  },

  /** Update an existing team */
  async update(id: string, payload: UpdateTeamPayload): Promise<Team> {
    const res = await api.put<Team>(`/workspaces/${id}`, payload);
    return res.data;
  },

  /** Delete a team */
  async remove(id: string): Promise<void> {
    await api.delete(`/workspaces/${id}`);
  },

  /** Add a member to a team */
  async addMember(
    teamId: string,
    payload: AddTeamMemberPayload,
  ): Promise<Team> {
    const res = await api.post<Team>(
      `/workspaces/${teamId}/members`,
      payload,
    );
    return res.data;
  },

  /** Remove a member from a team */
  async removeMember(teamId: string, userId: string): Promise<Team> {
    const res = await api.delete<Team>(
      `/workspaces/${teamId}/members/${userId}`,
    );
    return res.data;
  },

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
  ): Promise<Team> {
    const res = await api.patch<Team>(
      `/workspaces/${workspaceId}/members/${userId}/role`,
      { role },
    );
    return res.data;
  },

  async updateMemberStatus(
    workspaceId: string,
    userId: string,
    status: "ACTIVE" | "SUSPENDED",
  ): Promise<Team> {
    const res = await api.patch<Team>(
      `/workspaces/${workspaceId}/members/${userId}/status`,
      { status },
    );
    return res.data;
  },

  async listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
    const res = await api.get<WorkspaceInvitation[]>(
      `/workspaces/${workspaceId}/invitations`,
    );
    return res.data;
  },

  async invite(
    workspaceId: string,
    input: { email: string; role: WorkspaceRole },
  ): Promise<WorkspaceInvitation> {
    const res = await api.post<WorkspaceInvitation>(
      `/workspaces/${workspaceId}/invitations`,
      input,
    );
    return res.data;
  },

  async revokeInvitation(
    workspaceId: string,
    invitationId: string,
  ): Promise<void> {
    await api.delete(
      `/workspaces/${workspaceId}/invitations/${invitationId}`,
    );
  },

  async acceptInvitation(token: string): Promise<Team> {
    const res = await api.post<Team>("/workspaces/invitations/accept", {
      token,
    });
    return res.data;
  },
};
