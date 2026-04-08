import api from '@/lib/api';
import type {
  ProjectDetail,
  ProjectListItem,
  CreateProjectPayload,
  UpdateProjectPayload,
  AddMemberPayload,
  ConnectGitlabPayload,
  GitlabBranch,
  GitlabConfig,
  GitlabPipeline,
} from '@/types/project';

export const projectsService = {
  /** List all accessible projects */
  async getAll(): Promise<ProjectListItem[]> {
    const res = await api.get<ProjectListItem[]>('/projects');
    return res.data;
  },

  /** Get a single project by ID */
  async getById(id: string): Promise<ProjectDetail> {
    const res = await api.get<ProjectDetail>(`/projects/${id}`);
    return res.data;
  },

  /** Create a new project */
  async create(payload: CreateProjectPayload): Promise<ProjectDetail> {
    const res = await api.post<ProjectDetail>('/projects', payload);
    return res.data;
  },

  /** Update an existing project */
  async update(id: string, payload: UpdateProjectPayload): Promise<ProjectDetail> {
    const res = await api.put<ProjectDetail>(`/projects/${id}`, payload);
    return res.data;
  },

  /** Delete a project */
  async remove(id: string): Promise<void> {
    await api.delete(`/projects/${id}`);
  },

  /** Add a member to a project */
  async addMember(projectId: string, payload: AddMemberPayload): Promise<ProjectDetail> {
    const res = await api.post<ProjectDetail>(
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
  ): Promise<GitlabConfig> {
    const res = await api.post<GitlabConfig>(
      `/projects/${projectId}/gitlab/connect`,
      payload,
    );
    return res.data;
  },

  /** Get masked GitLab configuration for a project */
  async getGitlabConfig(projectId: string): Promise<GitlabConfig> {
    const res = await api.get<GitlabConfig>(`/projects/${projectId}/gitlab/config`);
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
  async triggerPipeline(projectId: string, branch: string): Promise<GitlabPipeline> {
    const res = await api.post<GitlabPipeline>(
      `/projects/${projectId}/gitlab/pipelines/trigger`,
      { branch },
    );
    return res.data;
  },
};
