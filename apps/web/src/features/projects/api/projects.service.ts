import api from "@/shared/lib/api";
import type {
  ProjectDetail,
  ProjectListItem,
  CreateProjectPayload,
  UpdateProjectPayload,
  AddMemberPayload,
  ConnectSourcePayload,
  GitlabBranch,
  GitlabPipeline,
  SourceProviderOption,
  ImportGitlabGroupPayload,
} from "@/features/projects/types/project";

export const projectsService = {
  async getAll(): Promise<ProjectListItem[]> {
    const res = await api.get<ProjectListItem[]>("/projects");
    return res.data;
  },

  async getById(id: string): Promise<ProjectDetail> {
    const res = await api.get<ProjectDetail>(`/projects/${id}`);
    return res.data;
  },

  async create(payload: CreateProjectPayload): Promise<ProjectDetail> {
    const res = await api.post<ProjectDetail>("/projects", payload);
    return res.data;
  },

  async importGitlabGroup(payload: ImportGitlabGroupPayload): Promise<{
    mode: string;
    projects: ProjectDetail[];
  }> {
    const res = await api.post<{ mode: string; projects: ProjectDetail[] }>(
      "/projects/import/gitlab-group",
      payload,
    );
    return res.data;
  },

  async update(
    id: string,
    payload: UpdateProjectPayload,
  ): Promise<ProjectDetail> {
    const res = await api.put<ProjectDetail>(`/projects/${id}`, payload);
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/projects/${id}`);
  },

  async addMember(
    projectId: string,
    payload: AddMemberPayload,
  ): Promise<ProjectDetail> {
    const res = await api.post<ProjectDetail>(
      `/projects/${projectId}/members`,
      payload,
    );
    return res.data;
  },

  async removeMember(projectId: string, memberId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/members/${memberId}`);
  },

  async connectSource(
    projectId: string,
    payload: ConnectSourcePayload,
  ): Promise<unknown> {
    // The backend ConnectSourceDto whitelists exactly these fields and rejects
    // any other (provider/repoPath/groupPath/defaultBranch/providerId/token).
    // Map the UI payload (which still carries legacy gitlab* fields) onto it.
    const repoPath =
      payload.repoPath ??
      (payload.sourceType !== "GROUP" && payload.gitlabId != null
        ? String(payload.gitlabId)
        : undefined);
    const groupPath =
      payload.gitlabGroupId != null
        ? String(payload.gitlabGroupId)
        : payload.sourceType === "GROUP" && payload.gitlabId != null
          ? String(payload.gitlabId)
          : undefined;
    const token = payload.token ?? payload.gitlabToken ?? payload.githubToken;
    const body = {
      provider: payload.provider,
      ...(payload.providerId ? { providerId: payload.providerId } : {}),
      ...(repoPath ? { repoPath } : {}),
      ...(groupPath ? { groupPath } : {}),
      ...(payload.defaultBranch
        ? { defaultBranch: payload.defaultBranch }
        : {}),
      ...(token ? { token } : {}),
    };
    const res = await api.post(`/projects/${projectId}/source/connect`, body);
    return res.data;
  },

  async getBranches(
    projectId: string,
    repoId?: number,
  ): Promise<GitlabBranch[]> {
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

  // Pipelines du dépôt PROPRE au service (1 service = 1 repo) — évite de viser
  // un autre dépôt du projet.
  async getServicePipelines(
    projectId: string,
    serviceId: string,
  ): Promise<GitlabPipeline[]> {
    const res = await api.get<GitlabPipeline[]>(
      `/projects/${projectId}/services/${serviceId}/gitlab/pipelines`,
    );
    return res.data;
  },

  async triggerPipeline(
    projectId: string,
    branch: string,
  ): Promise<GitlabPipeline> {
    const res = await api.post<GitlabPipeline>(
      `/projects/${projectId}/gitlab/pipelines/trigger`,
      { branch },
    );
    return res.data;
  },

  async fetchGitlabProjectBranches(params: {
    providerId?: string;
    gitlabProjectId: number | string;
    gitlabUrl?: string;
    gitlabToken?: string;
  }): Promise<GitlabBranch[]> {
    const providerId = params.providerId || "default";
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

  async getSourceProviders(): Promise<SourceProviderOption[]> {
    const res = await api.get<SourceProviderOption[]>("/source/providers");
    return res.data;
  },
};
