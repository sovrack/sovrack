import api from '@/lib/api';
import type { AuditLogPage } from '@/types/audit-log';

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
