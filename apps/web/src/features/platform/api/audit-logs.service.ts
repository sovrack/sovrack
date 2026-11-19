import api from "@/shared/lib/api";
import type { AuditLogItem, AuditLogPage } from "@/features/platform/types/audit-log";
import {
  normalizeDataPagination,
  type PaginatedResponse,
} from "@/shared/types/pagination";

type AuditLogsQuery = {
  page?: number;
  limit?: number;
};

export const auditLogsService = {
  async getAll(
    query: AuditLogsQuery = {},
  ): Promise<PaginatedResponse<AuditLogItem>> {
    const res = await api.get<AuditLogPage>("/admin/audit-logs", {
      params: query,
    });
    return normalizeDataPagination(res.data);
  },
};
