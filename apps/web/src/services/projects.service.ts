import api from '@/lib/api';
import type {
  Project,
  CreateProjectPayload,
  UpdateProjectPayload,
  AddMemberPayload,
  ConnectGitlabPayload,
  GitlabBranch,
  GitlabPipeline,
} from '@/types/project';

export const projectsService = {
  /** List all accessible projects */
  async getAll(): Promise<Project[]> {
    const res = await api.get<Project[]>('/projects');
    return res.data;
  },

  /** Get a single project by ID */
  async getById(id: string): Promise<Project> {
    const res = await api.get<Project>(`/projects/${id}`);
    return res.data;
  },

  /** Create a new project */
  async create(payload: CreateProjectPayload): Promise<Project> {
    const res = await api.post<Project>('/projects', payload);
    return res.data;
  },

  /** Update an existing project */
  async update(id: string, payload: UpdateProjectPayload): Promise<Project> {
    const res = await api.patch<Project>(`/projects/${id}`, payload);
    return res.data;
  },

  /** Delete a project */
  async remove(id: string): Promise<void> {
    await api.delete(`/projects/${id}`);
  },

  /** Add a member to a project */
  async addMember(projectId: string, payload: AddMemberPayload): Promise<Project> {
    const res = await api.post<Project>(
      `/projects/${projectId}/members`,
      payload,
    );
    return res.data;
  },

  /** Remove a member from a project */
  async removeMember(projectId: string, memberId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/members/${memberId}`);
  },

  /** Connect a GitLab repository to the project */
  async connectGitlab(
    projectId: string,
    payload: ConnectGitlabPayload,
  ): Promise<Project> {
    const res = await api.post<Project>(
      `/projects/${projectId}/gitlab/connect`,
      payload,
    );
    return res.data;
  },

  /** Get GitLab branches for a project */
  async getBranches(projectId: string): Promise<GitlabBranch[]> {
    const res = await api.get<GitlabBranch[]>(
      `/projects/${projectId}/gitlab/branches`,
    );
    return res.data;
  },

  /** Get GitLab pipelines for a project */
  async getPipelines(projectId: string): Promise<GitlabPipeline[]> {
    const res = await api.get<GitlabPipeline[]>(
      `/projects/${projectId}/gitlab/pipelines`,
    );
    return res.data;
  },

  /** Trigger a GitLab pipeline on a specific branch */
  async triggerPipeline(projectId: string, branch: string): Promise<void> {
    await api.post(`/projects/${projectId}/gitlab/trigger`, { branch });
  },
};
