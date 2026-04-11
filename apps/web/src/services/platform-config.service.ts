import api from '@/lib/api';
import type {
  GitlabTestResult,
  PlatformConfigItem,
  UpdatePlatformConfigPayload,
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

  async testGitlab(): Promise<GitlabTestResult> {
    const res = await api.post<GitlabTestResult>('/admin/platform-config/test-gitlab');
    return res.data;
  },
};
