import api from '@/shared/lib/api';
import type { AuditLogPage } from '@/features/platform/types/audit-log';

type AuditLogsQuery = {
  page?: number;
  limit?: number;
};

export const auditLogsService = {
  async getAll(query: AuditLogsQuery = {}): Promise<AuditLogPage> {
    const res = await api.get<AuditLogPage>('/admin/audit-logs', {
      params: query,
    });
    return res.data;
  },
};
