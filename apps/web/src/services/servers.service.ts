import api from '@/lib/api';
import type {
  Server,
  CreateServerResult,
  CreateServerPayload,
  UpdateServerPayload,
  VerifyServerResult,
  InstallToolsPayload,
  RegisterRunnerPayload,
  ServerJob,
  InstallServerKeyPayload,
  InstallServerKeyResult,
} from '@/types/server';

export const serversService = {
  async getAll(): Promise<Server[]> {
    const res = await api.get<Server[]>('/servers');
    return res.data;
  },

  async getById(id: string): Promise<Server> {
    const res = await api.get<Server>(`/servers/${id}`);
    return res.data;
  },

  async create(payload: CreateServerPayload): Promise<CreateServerResult> {
    const res = await api.post<CreateServerResult>('/servers', payload);
    return res.data;
  },

  async update(id: string, payload: UpdateServerPayload): Promise<Server> {
    const res = await api.put<Server>(`/servers/${id}`, payload);
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/servers/${id}`);
  },

  async verify(id: string): Promise<VerifyServerResult> {
    const res = await api.post<VerifyServerResult>(`/servers/${id}/verify`);
    return res.data;
  },

  async installTools(
    id: string,
    payload: InstallToolsPayload,
  ): Promise<Server> {
    const res = await api.post<Server>(`/servers/${id}/install`, payload);
    return res.data;
  },

  async installKey(
    id: string,
    payload: InstallServerKeyPayload,
  ): Promise<InstallServerKeyResult> {
    const res = await api.post<InstallServerKeyResult>(
      `/servers/${id}/install-key`,
      payload,
    );
    return res.data;
  },

  async registerRunner(
    id: string,
    payload: RegisterRunnerPayload,
  ): Promise<Server> {
    const res = await api.post<Server>(`/servers/${id}/register-runner`, payload);
    return res.data;
  },

  async getJobs(id: string): Promise<ServerJob[]> {
    const res = await api.get<ServerJob[]>(`/servers/${id}/jobs`);
    return res.data;
  },

  async retryJob(id: string, jobId: string): Promise<Server> {
    const res = await api.post<Server>(`/servers/${id}/jobs/${jobId}/retry`);
    return res.data;
  },
};
