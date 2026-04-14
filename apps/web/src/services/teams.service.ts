import api from '@/lib/api';
import type {
  Team,
  CreateTeamPayload,
  UpdateTeamPayload,
  AddTeamMemberPayload,
} from '@/types/team';

export const teamsService = {
  /** List all teams */
  async getAll(): Promise<Team[]> {
    const res = await api.get<Team[]>('/teams');
    return res.data;
  },

  /** Get a single team by ID */
  async getById(id: string): Promise<Team> {
    const res = await api.get<Team>(`/teams/${id}`);
    return res.data;
  },

  /** Create a new team */
  async create(payload: CreateTeamPayload): Promise<Team> {
    const res = await api.post<Team>('/teams', payload);
    return res.data;
  },

  /** Update an existing team */
  async update(id: string, payload: UpdateTeamPayload): Promise<Team> {
    const res = await api.put<Team>(`/teams/${id}`, payload);
    return res.data;
  },

  /** Delete a team */
  async remove(id: string): Promise<void> {
    await api.delete(`/teams/${id}`);
  },

  /** Add a member to a team */
  async addMember(teamId: string, payload: AddTeamMemberPayload): Promise<Team> {
    const res = await api.post<Team>(`/teams/${teamId}/members`, payload);
    return res.data;
  },

  /** Remove a member from a team */
  async removeMember(teamId: string, userId: string): Promise<Team> {
    const res = await api.delete<Team>(`/teams/${teamId}/members/${userId}`);
    return res.data;
  },

  /** Add all team members to a project */
  async addTeamToProject(projectId: string, teamId: string): Promise<{ message: string }> {
    const res = await api.post<{ message: string }>(
      `/projects/${projectId}/teams/${teamId}`,
    );
    return res.data;
  },
};
