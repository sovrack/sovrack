import api from '@/lib/api';
import type { Deployment, CreateDeploymentPayload } from '@/types/deployment';

export const deploymentsService = {
  async getAll(): Promise<Deployment[]> {
    const res = await api.get<Deployment[]>('/deployments');
    return res.data;
  },

  async getByProject(projectId: string): Promise<Deployment[]> {
    const res = await api.get<Deployment[]>(`/deployments/project/${projectId}`);
    return res.data;
  },

  async getById(id: string): Promise<Deployment> {
    const res = await api.get<Deployment>(`/deployments/${id}`);
    return res.data;
  },

  async create(payload: CreateDeploymentPayload): Promise<Deployment> {
    const res = await api.post<Deployment>('/deployments', payload);
    return res.data;
  },

  async cancel(id: string): Promise<Deployment> {
    const res = await api.post<Deployment>(`/deployments/${id}/cancel`);
    return res.data;
  },

  async rollback(id: string): Promise<Deployment> {
    const res = await api.post<Deployment>(`/deployments/${id}/rollback`);
    return res.data;
  },
};
