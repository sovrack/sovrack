import api from "@/shared/lib/api";
import type {
  CreateServerPayload,
  CreateServerResult,
  InstallServerKeyPayload,
  InstallServerKeyResult,
  RegisterRunnerPayload,
  Server,
  ServerCapability,
  ServerInstalledTool,
  ServerJob,
  ServerSetup,
  ServerSetupLog,
  ServerSetupReadiness,
  ServerAuditEvent,
  ServerValidationResult,
  StartServerSetupPayload,
  UpdateServerPayload,
  VerifyServerResult,
} from "@/features/servers/types/server";
import type { RawDataPaginatedResponse } from "@/shared/types/pagination";

type ListParams = {
  page?: number;
  limit?: number;
};

// getAll/getJobs deliberately discard pagination metadata and return a flat
// array — no consumer needs page/total/limit for these lists today (unlike
// automation/audit-logs, which unify via shared/types/pagination.ts's
// PaginatedResponse<T>). This guard only recognizes the shared raw shape.
function isPaginatedResponse<T>(
  value: unknown,
): value is RawDataPaginatedResponse<T> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Array.isArray((value as RawDataPaginatedResponse<T>).data);
}

export type StartSetupPayload = StartServerSetupPayload;

/** Metadata of a server's Docker TLS connection (certs are write-only). */
export type DockerConnectionInfo = {
  id: string;
  serverId: string;
  endpoint: string;
  apiVersion: string | null;
  lastCheckedAt: string | null;
  isReachable: boolean;
  createdAt: string;
  updatedAt: string;
};

export const serversService = {
  async getAll(params?: ListParams): Promise<Server[]> {
    const res = await api.get<RawDataPaginatedResponse<Server> | Server[]>(
      "/servers",
      {
        params,
      },
    );

    if (isPaginatedResponse<Server>(res.data)) {
      return res.data.data;
    }

    return res.data;
  },

  // A3: lightweight TCP reachability ping for every active server — distinct
  // from isVerified/status (last on-demand SSH validation result). Meant to
  // be polled frequently (30-60s) by the list page.
  async getReachability(): Promise<Record<string, boolean>> {
    const res = await api.get<Record<string, boolean>>("/servers/reachability");
    return res.data;
  },

  async getById(id: string): Promise<Server> {
    const res = await api.get<Server>(`/servers/${id}`);
    return res.data;
  },

  async create(payload: CreateServerPayload): Promise<CreateServerResult> {
    const res = await api.post<CreateServerResult>("/servers", payload);
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
    const res = await api.post<VerifyServerResult>(
      `/servers/${id}/validate-ssh`,
      {},
    );
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
        message: server.verificationError ?? "Connection validated",
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Connection error",
      };
    }
  },

  async detect(id: string): Promise<Server> {
    const res = await api.post<Server>(`/servers/${id}/detect`, {});
    return res.data;
  },

  /**
   * Docker TLS connection metadata for a server (endpoint, reachability,
   * API version — certs are write-only and never returned). null = not
   * configured yet (404). Registered automatically by the "Docker TLS
   * Connection" Setup Server option, or manually via the same endpoint.
   */
  async getDockerConnection(id: string): Promise<DockerConnectionInfo | null> {
    try {
      const res = await api.get<DockerConnectionInfo>(
        `/servers/${id}/docker-connection`,
      );
      return res.data;
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "response" in err &&
        (err as { response?: { status?: number } }).response?.status === 404
      ) {
        return null;
      }
      throw err;
    }
  },

  async startSetup(
    id: string,
    payload: StartSetupPayload,
  ): Promise<ServerSetup> {
    const res = await api.post<ServerSetup>(
      `/servers/${id}/setups`,
      payload,
    );
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
    const res = await api.post<Server>(
      `/servers/${id}/register-runner`,
      payload,
    );
    return res.data;
  },

  async getJobs(id: string, params?: ListParams): Promise<ServerJob[]> {
    const res = await api.get<ServerJob[] | RawDataPaginatedResponse<ServerJob>>(
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
    const res = await api.post<ServerJob>(
      `/servers/${id}/jobs/${jobId}/cancel`,
    );
    return res.data;
  },

  async getSetups(id: string): Promise<ServerSetup[]> {
    const res = await api.get<ServerSetup[]>(
      `/servers/${id}/setups`,
    );
    return res.data;
  },

  async getSetupReadiness(
    id: string,
  ): Promise<ServerSetupReadiness> {
    const res = await api.get<ServerSetupReadiness>(
      `/servers/${id}/setup-readiness`,
    );
    return res.data;
  },

  async getSetup(id: string): Promise<ServerSetup> {
    const res = await api.get<ServerSetup>(`/setups/${id}`);
    return res.data;
  },

  async getSetupLogs(
    id: string,
    afterLine?: number,
  ): Promise<ServerSetupLog[]> {
    const res = await api.get<ServerSetupLog[]>(
      `/setups/${id}/logs`,
      {
        params: afterLine ? { afterLine } : undefined,
      },
    );
    return res.data;
  },

  async retrySetup(
    id: string,
    reason?: string,
  ): Promise<ServerSetup> {
    const res = await api.post<ServerSetup>(`/setups/${id}/retry`, {
      reason,
    });
    return res.data;
  },

  async cancelSetup(id: string): Promise<ServerSetup> {
    const res = await api.post<ServerSetup>(`/setups/${id}/cancel`);
    return res.data;
  },

  async getCapabilities(id: string): Promise<ServerCapability[]> {
    const res = await api.get<ServerCapability[]>(
      `/servers/${id}/capabilities`,
    );
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
    const res = await api.get<ServerAuditEvent[]>(
      `/servers/${id}/audit-events`,
    );
    return res.data;
  },
};
