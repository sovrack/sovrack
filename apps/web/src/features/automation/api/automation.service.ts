import api from "@/shared/lib/api";
import type {
  AutomationAction,
  AutomationRun,
  AutomationRunLog,
  AutomationRunsListResponse,
  CreateAutomationRunPayload,
} from "@/features/automation/types/automation";
import type { PaginatedResponse } from "@/shared/types/pagination";

export const automationService = {
  async getActions(): Promise<AutomationAction[]> {
    const res = await api.get<AutomationAction[]>("/automation/actions");
    return res.data;
  },

  async getRuns(
    page = 1,
    pageSize = 20,
  ): Promise<PaginatedResponse<AutomationRun>> {
    const res = await api.get<AutomationRunsListResponse>("/automation/runs", {
      params: { page, pageSize },
    });
    const raw = res.data;
    return {
      items: raw.items,
      page: raw.page,
      pageSize: raw.pageSize,
      total: raw.total,
      totalPages: raw.pageSize > 0 ? Math.ceil(raw.total / raw.pageSize) : 1,
    };
  },

  async getRun(id: string): Promise<AutomationRun> {
    const res = await api.get<AutomationRun>(`/automation/runs/${id}`);
    return res.data;
  },

  async getRunLogs(
    id: string,
    afterLine?: number,
  ): Promise<AutomationRunLog[]> {
    const res = await api.get<AutomationRunLog[]>(
      `/automation/runs/${id}/logs`,
      {
        params: afterLine ? { afterLine } : undefined,
      },
    );
    return res.data;
  },

  async startRun(payload: CreateAutomationRunPayload): Promise<AutomationRun> {
    const res = await api.post<AutomationRun>("/automation/runs", payload);
    return res.data;
  },

  async deleteRun(id: string): Promise<void> {
    await api.delete(`/automation/runs/${id}`);
  },

  async cancelRun(id: string): Promise<AutomationRun> {
    const res = await api.post<AutomationRun>(`/automation/runs/${id}/cancel`);
    return res.data;
  },
};
