import api from '@/lib/api';
import type {
  ProjectDetail,
  ProjectListItem,
  CreateProjectPayload,
  UpdateProjectPayload,
  AddMemberPayload,
  ConnectGitlabPayload,
  ConnectSourcePayload,
  GitlabConfig,
  GitlabBranch,
  GitlabPipeline,
  GitlabRepo,
  GitlabProviderOption,
  SourceProviderOption,
  GitlabGroupRepositoriesResponse,
  ImportGitlabGroupPayload,
} from '@/types/project';

export const projectsService = {
  async getAll(): Promise<ProjectListItem[]> {
    const res = await api.get<ProjectListItem[]>('/projects');
    return res.data;
  },

  async getById(id: string): Promise<ProjectDetail> {
    const res = await api.get<ProjectDetail>(`/projects/${id}`);
    return res.data;
  },

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

  async update(id: string, payload: UpdateProjectPayload): Promise<ProjectDetail> {
    const res = await api.put<ProjectDetail>(`/projects/${id}`, payload);
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/projects/${id}`);
  },

  async addMember(projectId: string, payload: AddMemberPayload): Promise<ProjectDetail> {
    const res = await api.post<ProjectDetail>(
      `/projects/${projectId}/members`,
      payload,
    );
    return res.data;
  },

  async removeMember(projectId: string, memberId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/members/${memberId}`);
  },

  /** API path still uses /gitlab/connect – will be updated when backend routes are generic */
  async connectSourceConfig(projectId: string, payload: ConnectGitlabPayload): Promise<GitlabConfig> {
    const res = await api.post<GitlabConfig>(
      `/projects/${projectId}/gitlab/connect`,
      payload,
    );
    return res.data;
  },

  /** @deprecated Use `connectSourceConfig` instead */
  async connectGitlab(projectId: string, payload: ConnectGitlabPayload): Promise<GitlabConfig> {
    return this.connectSourceConfig(projectId, payload);
  },

  async connectSource(
    projectId: string,
    payload: ConnectSourcePayload,
  ): Promise<unknown> {
    const res = await api.post(
      `/projects/${projectId}/source/connect`,
      payload,
    );
    return res.data;
  },

  /** API path still uses /gitlab/config – will be updated when backend routes are generic */
  async getSourceConfig(projectId: string): Promise<GitlabConfig> {
    const res = await api.get<GitlabConfig>(`/projects/${projectId}/gitlab/config`);
    return res.data;
  },

  /** @deprecated Use `getSourceConfig` instead */
  async getGitlabConfig(projectId: string): Promise<GitlabConfig> {
    return this.getSourceConfig(projectId);
  },

  async getBranches(projectId: string, repoId?: number): Promise<GitlabBranch[]> {
    const res = await api.get<GitlabBranch[]>(
      `/projects/${projectId}/gitlab/branches`,
      {
        params: repoId ? { repoId } : undefined,
      },
    );
    return res.data;
  },

  async getPipelines(projectId: string): Promise<GitlabPipeline[]> {
    const res = await api.get<GitlabPipeline[]>(
      `/projects/${projectId}/gitlab/pipelines`,
    );
    return res.data;
  },

  async triggerPipeline(projectId: string, branch: string): Promise<GitlabPipeline> {
    const res = await api.post<GitlabPipeline>(
      `/projects/${projectId}/gitlab/pipelines/trigger`,
      { branch },
    );
    return res.data;
  },

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

  async getGitlabProviders(): Promise<GitlabProviderOption[]> {
    const res = await api.get<GitlabProviderOption[]>('/gitlab/providers');
    return res.data;
  },

  async getSourceProviders(): Promise<SourceProviderOption[]> {
    const res = await api.get<SourceProviderOption[]>('/source/providers');
    return res.data;
  },
};
