import api from "@/shared/lib/api";
import type {
  CreateDeploymentPayload,
  Deployment,
  DeploymentMutation,
  DeployValidationResult,
  EnvPreview,
} from "@/features/deployments/types";

export const deploymentsService = {
  async previewEnv(serviceEnvId: string): Promise<EnvPreview> {
    const res = await api.get<EnvPreview>("/deployments/preview-env", {
      params: { serviceEnvId },
    });
    return res.data;
  },

  async getAll(): Promise<Deployment[]> {
    const res = await api.get<Deployment[]>("/deployments");
    return res.data;
  },

  async getByProject(projectId: string): Promise<Deployment[]> {
    const res = await api.get<Deployment[]>(
      `/deployments/project/${projectId}`,
    );
    return res.data;
  },

  async getById(id: string): Promise<Deployment> {
    const res = await api.get<Deployment>(`/deployments/${id}`);
    return res.data;
  },

  async create({
    serviceEnvId,
    branch,
    strategy,
    buildSource,
    overrideImage,
  }: CreateDeploymentPayload): Promise<DeploymentMutation> {
    const res = await api.post<DeploymentMutation>("/deployments", {
      serviceEnvId,
      branch,
      strategy,
      buildSource,
      overrideImage,
    });
    return res.data;
  },

  async cancel(id: string): Promise<DeploymentMutation> {
    const res = await api.post<DeploymentMutation>(`/deployments/${id}/cancel`);
    return res.data;
  },

  async rollback(
    id: string,
    targetDeploymentId?: string,
  ): Promise<DeploymentMutation> {
    const res = await api.post<DeploymentMutation>(
      `/deployments/${id}/rollback`,
      targetDeploymentId ? { targetDeploymentId } : undefined,
    );
    return res.data;
  },

  async validate(
    projectId: string,
    environmentId: string,
    buildSource?: string,
  ): Promise<DeployValidationResult> {
    const res = await api.post<DeployValidationResult>(
      "/deployments/validate",
      {
        projectId,
        environmentId,
        buildSource,
      },
    );
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/deployments/${id}`);
  },

  async searchLogs(
    id: string,
    q: string,
    level: "ALL" | "INFO" | "WARN" | "ERROR" = "ALL",
  ): Promise<{
    total: number;
    hits: {
      lineNumber: number;
      level: "INFO" | "WARN" | "ERROR";
      message: string;
    }[];
  }> {
    const res = await api.get<{
      total: number;
      hits: {
        lineNumber: number;
        level: "INFO" | "WARN" | "ERROR";
        message: string;
      }[];
    }>(`/deployments/${id}/logs/search`, { params: { q, level } });
    return res.data;
  },

  async getContainerLogs(id: string, tail = 300): Promise<string> {
    const res = await api.get<{ logs: string }>(
      `/deployments/${id}/container-logs`,
      { params: { tail } },
    );
    return res.data.logs;
  },
};
