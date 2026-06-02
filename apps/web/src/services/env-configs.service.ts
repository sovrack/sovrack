import api from '@/lib/api';
import type { EnvConfig, UpsertEnvConfigPayload } from '@/types/config';

export const envConfigsService = {
  async getAll(projectId: string, environmentId: string): Promise<EnvConfig[]> {
    const res = await api.get<EnvConfig[]>(
      `/projects/${projectId}/environments/${environmentId}/configs`,
    );
    return res.data;
  },

  async upsert(
    projectId: string,
    environmentId: string,
    payload: UpsertEnvConfigPayload,
  ): Promise<EnvConfig> {
    const res = await api.put<EnvConfig>(
      `/projects/${projectId}/environments/${environmentId}/configs`,
      payload,
    );
    return res.data;
  },

  async remove(projectId: string, environmentId: string, key: string): Promise<void> {
    await api.delete(
      `/projects/${projectId}/environments/${environmentId}/configs/${encodeURIComponent(key)}`,
    );
  },
};
