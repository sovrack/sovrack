import api from '@/lib/api';
import type {
  CreateDeploymentPayload,
  Deployment,
  DeploymentMutation,
} from '@/types/deployment';

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

  async create({
    projectId,
    environmentId,
    branch,
    strategy,
    buildMode,
    overrideImage,
    serviceId,
    repoId,
  }: CreateDeploymentPayload): Promise<DeploymentMutation> {
    const res = await api.post<DeploymentMutation>('/deployments', {
      projectId,
      environmentId,
      branch,
      strategy,
      buildMode,
      overrideImage,
      serviceId,
      repoId,
    });
    return res.data;
  },

  async cancel(id: string): Promise<DeploymentMutation> {
    const res = await api.post<DeploymentMutation>(`/deployments/${id}/cancel`);
    return res.data;
  },

  async rollback(id: string): Promise<DeploymentMutation> {
    const res = await api.post<DeploymentMutation>(`/deployments/${id}/rollback`);
    return res.data;
  },

  async getContainerLogs(id: string, tail = 300): Promise<string> {
    const res = await api.get<{ logs: string }>(`/deployments/${id}/container-logs`, { params: { tail } });
    return res.data.logs;
  },
};
