import api from "@/shared/lib/api";

export type ContainerRecord = {
  id: string;
  dockerId: string;
  name: string;
  status:
    | "CREATED"
    | "RUNNING"
    | "PAUSED"
    | "RESTARTING"
    | "REMOVING"
    | "EXITED"
    | "DEAD";
  serviceId: string | null;
  serviceEnvId: string | null;
  serverId: string;
  deploymentId: string | null;
};

export const containersService = {
  async listByService(serviceId: string): Promise<ContainerRecord[]> {
    const res = await api.get<ContainerRecord[]>("/containers", {
      params: { serviceId },
    });
    return res.data;
  },

  async listByDeployment(deploymentId: string): Promise<ContainerRecord[]> {
    const res = await api.get<ContainerRecord[]>("/containers", {
      params: { deploymentId },
    });
    return res.data;
  },

  // C1/C3: scoped to a single ServiceEnvironment, not the whole service across
  // every environment — see VERIFICATION_ORGANISATION_FINALE.md §2.4/6.2.
  async listByServiceEnv(serviceEnvId: string): Promise<ContainerRecord[]> {
    const res = await api.get<ContainerRecord[]>("/containers", {
      params: { serviceEnvId },
    });
    return res.data;
  },

  async start(id: string): Promise<void> {
    await api.post(`/containers/${id}/start`);
  },

  async stop(id: string): Promise<void> {
    await api.post(`/containers/${id}/stop`);
  },

  async restart(id: string): Promise<void> {
    await api.post(`/containers/${id}/restart`);
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/containers/${id}`);
  },
};
