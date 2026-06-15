import api from '@/lib/api';

export type ContainerRecord = {
  id: string;
  dockerId: string;
  name: string;
  status: 'CREATED' | 'RUNNING' | 'PAUSED' | 'RESTARTING' | 'REMOVING' | 'EXITED' | 'DEAD';
  serviceId: string | null;
  serviceEnvId: string | null;
  serverId: string;
  deploymentId: string | null;
};

export const containersService = {
  async listByService(serviceId: string): Promise<ContainerRecord[]> {
    const res = await api.get<ContainerRecord[]>('/containers', { params: { serviceId } });
    return res.data;
  },

  async stop(id: string): Promise<void> {
    await api.post(`/containers/${id}/stop`);
  },

  async restart(id: string): Promise<void> {
    await api.post(`/containers/${id}/restart`);
  },
};
