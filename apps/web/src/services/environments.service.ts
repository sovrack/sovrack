import api from '@/lib/api';
import type {
  Environment,
  CreateEnvironmentPayload,
  UpdateEnvironmentPayload,
} from '@/types/environment';

export const environmentsService = {
  async getAll(projectId: string): Promise<Environment[]> {
    const res = await api.get<Environment[]>(`/projects/${projectId}/environments`);
    return res.data;
  },

  async create(projectId: string, payload: CreateEnvironmentPayload): Promise<Environment> {
    const res = await api.post<Environment>(`/projects/${projectId}/environments`, payload);
    return res.data;
  },

  async update(projectId: string, envId: string, payload: UpdateEnvironmentPayload): Promise<Environment> {
    const res = await api.put<Environment>(`/projects/${projectId}/environments/${envId}`, payload);
    return res.data;
  },

  async remove(projectId: string, envId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/environments/${envId}`);
  },
};
