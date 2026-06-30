import api from "@/shared/lib/api";

export type WebhookStatus = {
  configured: boolean;
  isActive?: boolean;
  provider?: string;
  webhookUrl?: string;
  lastEventAt?: string | null;
};

/**
 * Webhooks PAR SERVICE (1 service = 1 repo = 1 webhook). La branche du push
 * route ensuite vers l'environnement (ServiceEnvironment.autoBranch).
 * Backend : /projects/:projectId/webhook/{configure,status,pause,resume}?serviceId=…
 */
export const webhooksService = {
  async status(projectId: string, serviceId: string): Promise<WebhookStatus> {
    const res = await api.get<WebhookStatus>(
      `/projects/${projectId}/webhook/status?serviceId=${serviceId}`,
    );
    return res.data;
  },

  async configure(
    projectId: string,
    serviceId: string,
  ): Promise<{ webhookUrl: string; isNew: boolean }> {
    const res = await api.post<{ webhookUrl: string; isNew: boolean }>(
      `/projects/${projectId}/webhook/configure?serviceId=${serviceId}`,
    );
    return res.data;
  },

  async pause(projectId: string, serviceId: string): Promise<void> {
    await api.post(
      `/projects/${projectId}/webhook/pause?serviceId=${serviceId}`,
    );
  },

  async resume(projectId: string, serviceId: string): Promise<void> {
    await api.post(
      `/projects/${projectId}/webhook/resume?serviceId=${serviceId}`,
    );
  },
};
