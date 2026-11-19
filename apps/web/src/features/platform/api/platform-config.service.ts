import api from "@/shared/lib/api";
import { readWorkspaceSelection } from "@/shared/lib/workspace-storage";
import type {
  CreateGitlabProviderPayload,
  GitlabOAuthStartResult,
  GitlabProvider,
  GitlabTestResult,
  UpdateGitlabProviderPayload,
  RegistryConfig,
  CreateRegistryConfigPayload,
  UpdateRegistryConfigPayload,
  RegistryTestResult,
  GitRepoItem,
} from "@/features/platform/types/platform-config";

function integrationPath(resource: string): string {
  const workspaceId = readWorkspaceSelection();
  if (!workspaceId) {
    throw new Error("Sélectionnez un workspace avant de gérer ses intégrations.");
  }
  return `/workspaces/${encodeURIComponent(workspaceId)}/integrations/${resource}`;
}

export const platformConfigService = {
  async listGitlabProviders(): Promise<GitlabProvider[]> {
    const res = await api.get<GitlabProvider[]>(
      integrationPath("git/gitlab/providers"),
    );
    return res.data;
  },

  async createGitlabProvider(
    payload: CreateGitlabProviderPayload,
  ): Promise<GitlabProvider> {
    const res = await api.post<GitlabProvider>(
      integrationPath("git/gitlab/providers"),
      payload,
    );
    return res.data;
  },

  async updateGitlabProvider(
    id: string,
    payload: UpdateGitlabProviderPayload,
  ): Promise<GitlabProvider> {
    const res = await api.put<GitlabProvider>(
      integrationPath(`git/gitlab/providers/${encodeURIComponent(id)}`),
      payload,
    );
    return res.data;
  },

  async deleteGitlabProvider(id: string): Promise<void> {
    await api.delete(
      integrationPath(`git/gitlab/providers/${encodeURIComponent(id)}`),
    );
  },

  async setDefaultGitlabProvider(id: string): Promise<GitlabProvider> {
    const res = await api.post<GitlabProvider>(
      integrationPath(
        `git/gitlab/providers/${encodeURIComponent(id)}/default`,
      ),
    );
    return res.data;
  },

  async testGitlabProvider(id: string): Promise<GitlabTestResult> {
    const res = await api.post<GitlabTestResult>(
      integrationPath(`git/gitlab/providers/${encodeURIComponent(id)}/test`),
    );
    return res.data;
  },

  async startGitlabOAuthForProvider(
    id: string,
  ): Promise<GitlabOAuthStartResult> {
    const res = await api.post<GitlabOAuthStartResult>(
      integrationPath(
        `git/gitlab/providers/${encodeURIComponent(id)}/oauth/start`,
      ),
    );
    return res.data;
  },

  // ============= GitHub Provider Methods =============

  async listGithubProviders(): Promise<GitlabProvider[]> {
    const res = await api.get<GitlabProvider[]>(
      integrationPath("git/github/providers"),
    );
    return res.data;
  },

  async createGithubProvider(
    payload: CreateGitlabProviderPayload,
  ): Promise<GitlabProvider> {
    const res = await api.post<GitlabProvider>(
      integrationPath("git/github/providers"),
      payload,
    );
    return res.data;
  },

  async updateGithubProvider(
    id: string,
    payload: UpdateGitlabProviderPayload,
  ): Promise<GitlabProvider> {
    const res = await api.put<GitlabProvider>(
      integrationPath(`git/github/providers/${encodeURIComponent(id)}`),
      payload,
    );
    return res.data;
  },

  async deleteGithubProvider(id: string): Promise<void> {
    await api.delete(
      integrationPath(`git/github/providers/${encodeURIComponent(id)}`),
    );
  },

  async setDefaultGithubProvider(id: string): Promise<GitlabProvider> {
    const res = await api.post<GitlabProvider>(
      integrationPath(
        `git/github/providers/${encodeURIComponent(id)}/default`,
      ),
    );
    return res.data;
  },

  async testGithubProvider(id: string): Promise<GitlabTestResult> {
    const res = await api.post<GitlabTestResult>(
      integrationPath(`git/github/providers/${encodeURIComponent(id)}/test`),
    );
    return res.data;
  },

  async listGithubRepos(id: string): Promise<GitRepoItem[]> {
    const res = await api.get(
      integrationPath(`git/github/providers/${encodeURIComponent(id)}/repos`),
    );
    return res.data as GitRepoItem[];
  },

  async listGitlabRepos(id: string): Promise<GitRepoItem[]> {
    const res = await api.get(
      integrationPath(`git/gitlab/providers/${encodeURIComponent(id)}/repos`),
    );
    return res.data as GitRepoItem[];
  },

  async listProviderRepos(
    id: string,
    type: "GITLAB" | "GITHUB",
  ): Promise<GitRepoItem[]> {
    return type === "GITHUB"
      ? this.listGithubRepos(id)
      : this.listGitlabRepos(id);
  },

  // ============= Registry Configuration Methods =============

  async listRegistryConfigs(): Promise<RegistryConfig[]> {
    const res = await api.get<RegistryConfig[]>(
      integrationPath("registries"),
    );
    return res.data;
  },

  async createRegistryConfig(
    payload: CreateRegistryConfigPayload,
  ): Promise<RegistryConfig> {
    const res = await api.post<RegistryConfig>(
      integrationPath("registries"),
      payload,
    );
    return res.data;
  },

  async updateRegistryConfig(
    id: string,
    payload: UpdateRegistryConfigPayload,
  ): Promise<RegistryConfig> {
    const res = await api.put<RegistryConfig>(
      integrationPath(`registries/${encodeURIComponent(id)}`),
      payload,
    );
    return res.data;
  },

  async deleteRegistryConfig(id: string): Promise<void> {
    await api.delete(
      integrationPath(`registries/${encodeURIComponent(id)}`),
    );
  },

  async setDefaultRegistryConfig(id: string): Promise<RegistryConfig> {
    const res = await api.post<RegistryConfig>(
      integrationPath(
        `registries/${encodeURIComponent(id)}/set-default`,
      ),
    );
    return res.data;
  },

  async testRegistryConnection(id: string): Promise<RegistryTestResult> {
    const res = await api.post<RegistryTestResult>(
      integrationPath(`registries/${encodeURIComponent(id)}/test`),
    );
    return res.data;
  },
};
