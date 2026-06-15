import api from '@/lib/api';
import type {
  CreateServerPayload,
  CreateServerResult,
  InstallServerKeyPayload,
  InstallServerKeyResult,
  InstallToolsPayload,
  RegisterRunnerPayload,
  Server,
  ServerCapability,
  ServerInstalledTool,
  ServerJob,
  ServerPreparation,
  ServerPreparationLog,
  ServerPreparationReadiness,
  ServerPreparationOptionsResponse,
  ServerAuditEvent,
  ServerValidationResult,
  StartServerPreparationPayload,
  UpdateServerPayload,
  VerifyServerResult,
} from '@/types/server';

type PaginatedApiResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type ListParams = {
  page?: number;
  limit?: number;
};

function isPaginatedResponse<T>(
  value: unknown,
): value is PaginatedApiResponse<T> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return Array.isArray((value as PaginatedApiResponse<T>).data);
}

export type PrepareServerPayload = StartServerPreparationPayload;

export const serversService = {
  async getAll(params?: ListParams): Promise<Server[]> {
    const res = await api.get<PaginatedApiResponse<Server> | Server[]>('/servers', {
      params,
    });

    if (isPaginatedResponse<Server>(res.data)) {
      return res.data.data;
    }

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
    const res = await api.patch<Server>(`/servers/${id}`, payload);
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/servers/${id}`);
  },

  async verify(id: string): Promise<VerifyServerResult> {
    const res = await api.post<VerifyServerResult>(`/servers/${id}/validate-ssh`, {});
    return res.data;
  },

  async setRole(id: string, role: string): Promise<Server> {
    return await this.update(id, { infraRole: role } as UpdateServerPayload);
  },

  async ping(id: string): Promise<{ ok: boolean; message: string }> {
    try {
      const server = await this.verify(id);
      return {
        ok: Boolean(server.isVerified),
        message: server.verificationError ?? 'Connection validated',
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Erreur de connexion' };
    }
  },

  async detect(id: string): Promise<Server> {
    const res = await api.post<Server>(`/servers/${id}/detect`, {});
    return res.data;
  },

  async installTools(id: string, payload: InstallToolsPayload): Promise<Server> {
    const res = await api.post<Server>(`/servers/${id}/install`, payload);
    return res.data;
  },

  async prepare(
    id: string,
    payload: PrepareServerPayload,
  ): Promise<ServerPreparation> {
    const res = await api.post<ServerPreparation>(`/servers/${id}/preparations`, payload);
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

  async getJobs(id: string, params?: ListParams): Promise<ServerJob[]> {
    const res = await api.get<ServerJob[] | PaginatedApiResponse<ServerJob>>(
      `/servers/${id}/jobs`,
      { params },
    );

    if (isPaginatedResponse<ServerJob>(res.data)) {
      return res.data.data;
    }

    return res.data;
  },

  async retryJob(id: string, jobId: string): Promise<Server> {
    const res = await api.post<Server>(`/servers/${id}/jobs/${jobId}/retry`);
    return res.data;
  },

  async cancelJob(id: string, jobId: string): Promise<ServerJob> {
    const res = await api.post<ServerJob>(`/servers/${id}/jobs/${jobId}/cancel`);
    return res.data;
  },

  async getPreparationOptions(): Promise<ServerPreparationOptionsResponse> {
    const res = await api.get<ServerPreparationOptionsResponse>(
      '/server-preparation-options',
    );
    return res.data;
  },

  async getPreparations(id: string): Promise<ServerPreparation[]> {
    const res = await api.get<ServerPreparation[]>(`/servers/${id}/preparations`);
    return res.data;
  },

  async getPreparationReadiness(id: string): Promise<ServerPreparationReadiness> {
    const res = await api.get<ServerPreparationReadiness>(
      `/servers/${id}/preparation-readiness`,
    );
    return res.data;
  },

  async getPreparation(id: string): Promise<ServerPreparation> {
    const res = await api.get<ServerPreparation>(`/preparations/${id}`);
    return res.data;
  },

  async getPreparationLogs(
    id: string,
    afterLine?: number,
  ): Promise<ServerPreparationLog[]> {
    const res = await api.get<ServerPreparationLog[]>(`/preparations/${id}/logs`, {
      params: afterLine ? { afterLine } : undefined,
    });
    return res.data;
  },

  async retryPreparation(id: string, reason?: string): Promise<ServerPreparation> {
    const res = await api.post<ServerPreparation>(`/preparations/${id}/retry`, {
      reason,
    });
    return res.data;
  },

  async cancelPreparation(id: string): Promise<ServerPreparation> {
    const res = await api.post<ServerPreparation>(`/preparations/${id}/cancel`);
    return res.data;
  },

  async getCapabilities(id: string): Promise<ServerCapability[]> {
    const res = await api.get<ServerCapability[]>(`/servers/${id}/capabilities`);
    return res.data;
  },

  async getInstalledTools(id: string): Promise<ServerInstalledTool[]> {
    const res = await api.get<ServerInstalledTool[]>(
      `/servers/${id}/installed-tools`,
    );
    return res.data;
  },

  async getValidationResults(id: string): Promise<ServerValidationResult[]> {
    const res = await api.get<ServerValidationResult[]>(
      `/servers/${id}/validation-results`,
    );
    return res.data;
  },

  async getAuditEvents(id: string): Promise<ServerAuditEvent[]> {
    const res = await api.get<ServerAuditEvent[]>(`/servers/${id}/audit-events`);
    return res.data;
  },
};
