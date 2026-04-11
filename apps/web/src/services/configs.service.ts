import api from '@/lib/api';
import type { Config, CreateConfigPayload, UpdateConfigPayload } from '@/types/config';

export const configsService = {
  async getAll(projectId: string): Promise<Config[]> {
    const res = await api.get<Config[]>(`/projects/${projectId}/configs`);
    return res.data;
  },

  async create(projectId: string, payload: CreateConfigPayload): Promise<Config> {
    const res = await api.post<Config>(`/projects/${projectId}/configs`, payload);
    return res.data;
  },

  async update(projectId: string, configId: string, payload: UpdateConfigPayload): Promise<Config> {
    const res = await api.put<Config>(`/projects/${projectId}/configs/${configId}`, payload);
    return res.data;
  },

  async remove(projectId: string, configId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/configs/${configId}`);
  },
};
