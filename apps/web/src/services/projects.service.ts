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
  GitlabRepo,
  GitlabProviderOption,
  GitlabGroupRepositoriesResponse,
  ImportGitlabGroupPayload,
  CreateProjectServicePayload,
  ProjectService,
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

  async importGitlabGroup(payload: ImportGitlabGroupPayload): Promise<{
    mode: string;
    projects: ProjectDetail[];
  }> {
    const res = await api.post<{ mode: string; projects: ProjectDetail[] }>(
      '/projects/import/gitlab-group',
      payload,
    );
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
  async getBranches(projectId: string, repoId?: number): Promise<GitlabBranch[]> {
    const res = await api.get<GitlabBranch[]>(
      `/projects/${projectId}/gitlab/branches`,
      {
        params: repoId ? { repoId } : undefined,
      },
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

  /** Get repositories from REPO/GROUP source */
  async getRepos(projectId: string): Promise<GitlabRepo[]> {
    const res = await api.get<GitlabRepo[]>(`/projects/${projectId}/gitlab/repos`);
    return res.data;
  },

  async fetchGitlabGroupRepositories(params: {
    providerId?: string;
    groupId: string;
    gitlabUrl?: string;
    gitlabToken?: string;
    page?: number;
    perPage?: number;
    search?: string;
    visibility?: string;
    archived?: boolean;
  }): Promise<GitlabGroupRepositoriesResponse> {
    const providerId = params.providerId || 'default';
    const res = await api.get<GitlabGroupRepositoriesResponse>(
      `/gitlab/providers/${encodeURIComponent(providerId)}/groups/${encodeURIComponent(params.groupId)}/repositories`,
      {
        params: {
          gitlabUrl: params.gitlabUrl,
          gitlabToken: params.gitlabToken,
          page: params.page,
          perPage: params.perPage,
          search: params.search,
          visibility: params.visibility,
          archived:
            typeof params.archived === 'boolean'
              ? String(params.archived)
              : undefined,
        },
      },
    );
    return res.data;
  },

  async fetchGitlabProjectBranches(params: {
    providerId?: string;
    gitlabProjectId: number | string;
    gitlabUrl?: string;
    gitlabToken?: string;
  }): Promise<GitlabBranch[]> {
    const providerId = params.providerId || 'default';
    const res = await api.get<GitlabBranch[]>(
      `/gitlab/providers/${encodeURIComponent(providerId)}/projects/${encodeURIComponent(String(params.gitlabProjectId))}/branches`,
      {
        params: {
          gitlabUrl: params.gitlabUrl,
          gitlabToken: params.gitlabToken,
        },
      },
    );
    return res.data;
  },

  async getServices(projectId: string): Promise<ProjectService[]> {
    const res = await api.get<ProjectService[]>(`/projects/${projectId}/services`);
    return res.data;
  },

  async createService(
    projectId: string,
    payload: CreateProjectServicePayload,
  ): Promise<ProjectService> {
    const res = await api.post<ProjectService>(
      `/projects/${projectId}/services`,
      payload,
    );
    return res.data;
  },

  async getServicePipelines(projectId: string, serviceId: string): Promise<GitlabPipeline[]> {
    const res = await api.get<GitlabPipeline[]>(`/projects/${projectId}/services/${serviceId}/pipelines`);
    return res.data;
  },

  /** List global GitLab providers available for project-level connection */
  async getGitlabProviders(): Promise<GitlabProviderOption[]> {
    const res = await api.get<GitlabProviderOption[]>('/gitlab/providers');
    return res.data;
  },
};
