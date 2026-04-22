import api from '@/lib/api';
import type {
  CreateGitlabProviderPayload,
  GitlabOAuthStartResult,
  GitlabProvider,
  GitlabTestResult,
  PlatformConfigItem,
  UpdateGitlabProviderPayload,
  UpdatePlatformConfigPayload,
  RegistryConfig,
  CreateRegistryConfigPayload,
  UpdateRegistryConfigPayload,
  RegistryTestResult,
} from '@/types/platform-config';

export const platformConfigService = {
  async getAll(): Promise<PlatformConfigItem[]> {
    const res = await api.get<PlatformConfigItem[]>('/admin/platform-config');
    return res.data;
  },

  async update(
    key: string,
    payload: UpdatePlatformConfigPayload,
  ): Promise<PlatformConfigItem> {
    const res = await api.put<PlatformConfigItem>(
      `/admin/platform-config/${encodeURIComponent(key)}`,
      payload,
    );
    return res.data;
  },

  async listGitlabProviders(): Promise<GitlabProvider[]> {
    const res = await api.get<GitlabProvider[]>('/admin/platform-config/gitlab/providers');
    return res.data;
  },

  async createGitlabProvider(
    payload: CreateGitlabProviderPayload,
  ): Promise<GitlabProvider> {
    const res = await api.post<GitlabProvider>(
      '/admin/platform-config/gitlab/providers',
      payload,
    );
    return res.data;
  },

  async updateGitlabProvider(
    id: string,
    payload: UpdateGitlabProviderPayload,
  ): Promise<GitlabProvider> {
    const res = await api.put<GitlabProvider>(
      `/admin/platform-config/gitlab/providers/${encodeURIComponent(id)}`,
      payload,
    );
    return res.data;
  },

  async deleteGitlabProvider(id: string): Promise<void> {
    await api.delete(`/admin/platform-config/gitlab/providers/${encodeURIComponent(id)}`);
  },

  async setDefaultGitlabProvider(id: string): Promise<GitlabProvider> {
    const res = await api.post<GitlabProvider>(
      `/admin/platform-config/gitlab/providers/${encodeURIComponent(id)}/default`,
    );
    return res.data;
  },

  async testGitlabProvider(id: string): Promise<GitlabTestResult> {
    const res = await api.post<GitlabTestResult>(
      `/admin/platform-config/gitlab/providers/${encodeURIComponent(id)}/test`,
    );
    return res.data;
  },

  async startGitlabOAuthForProvider(id: string): Promise<GitlabOAuthStartResult> {
    const res = await api.post<GitlabOAuthStartResult>(
      `/admin/platform-config/gitlab/providers/${encodeURIComponent(id)}/oauth/start`,
    );
    return res.data;
  },

  // ============= Registry Configuration Methods =============

  async listRegistryConfigs(): Promise<RegistryConfig[]> {
    const res = await api.get<RegistryConfig[]>('/admin/platform-config/registries');
    return res.data;
  },

  async createRegistryConfig(
    payload: CreateRegistryConfigPayload,
  ): Promise<RegistryConfig> {
    const res = await api.post<RegistryConfig>(
      '/admin/platform-config/registries',
      payload,
    );
    return res.data;
  },

  async updateRegistryConfig(
    id: string,
    payload: UpdateRegistryConfigPayload,
  ): Promise<RegistryConfig> {
    const res = await api.put<RegistryConfig>(
      `/admin/platform-config/registries/${encodeURIComponent(id)}`,
      payload,
    );
    return res.data;
  },

  async deleteRegistryConfig(id: string): Promise<void> {
    await api.delete(`/admin/platform-config/registries/${encodeURIComponent(id)}`);
  },

  async setDefaultRegistryConfig(id: string): Promise<RegistryConfig> {
    const res = await api.post<RegistryConfig>(
      `/admin/platform-config/registries/${encodeURIComponent(id)}/set-default`,
    );
    return res.data;
  },

  async testRegistryConnection(id: string): Promise<RegistryTestResult> {
    const res = await api.post<RegistryTestResult>(
      `/admin/platform-config/registries/${encodeURIComponent(id)}/test`,
    );
    return res.data;
  },
};
