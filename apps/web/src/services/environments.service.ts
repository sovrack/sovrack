import api from '@/lib/api';
import type {
  Environment,
  CreateEnvironmentPayload,
  UpdateEnvironmentPayload,
} from '@/types/environment';
import type { ServiceEnvironment } from '@/types/service-environment';

export const environmentsService = {
  async getAll(projectId: string): Promise<Environment[]> {
    const res = await api.get<Environment[]>(`/projects/${projectId}/environments`);
    return res.data;
  },

  async create(projectId: string, payload: CreateEnvironmentPayload): Promise<Environment> {
    const res = await api.post<Environment>(`/projects/${projectId}/environments`, payload);
    return res.data;
  },

  async getById(projectId: string, envId: string): Promise<Environment> {
    const res = await api.get<Environment>(`/projects/${projectId}/environments/${envId}`);
    return res.data;
  },

  async update(projectId: string, envId: string, payload: UpdateEnvironmentPayload): Promise<Environment> {
    const res = await api.put<Environment>(`/projects/${projectId}/environments/${envId}`, payload);
    return res.data;
  },

  async remove(projectId: string, envId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/environments/${envId}`);
  },

  async getServers(projectId: string, envId: string): Promise<unknown[]> {
    const res = await api.get(`/projects/${projectId}/environments/${envId}/servers`);
    return res.data as unknown[];
  },

  async assignServer(projectId: string, envId: string, serverId: string): Promise<void> {
    await api.post(`/projects/${projectId}/environments/${envId}/servers`, { serverId });
  },

  async removeServer(projectId: string, envId: string, serverId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/environments/${envId}/servers/${serverId}`);
  },

  async getServiceLinks(projectId: string, envId: string): Promise<ServiceEnvironment[]> {
    const res = await api.get(`/projects/${projectId}/environments/${envId}/service-links`);
    return res.data;
  },

  async linkService(projectId: string, envId: string, serviceId: string, env?: string): Promise<void> {
    await api.post(`/projects/${projectId}/environments/${envId}/service-links`, { serviceId, env });
  },

  async unlinkService(projectId: string, envId: string, serviceLinkId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/environments/${envId}/service-links/${serviceLinkId}`);
  },
};
