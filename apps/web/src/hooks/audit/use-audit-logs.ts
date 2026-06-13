'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { auditLogsService } from '@/services/audit-logs.service';
import { getApiErrorMessage } from '@/lib/api';

/** Journal d'audit (paginé/filtrable). */
export function useAuditLogs(query: Parameters<typeof auditLogsService.getAll>[0] = {}) {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['audit-logs', query],
    queryFn: () => auditLogsService.getAll(query),
  });

  return {
    page: data ?? null,
    loading: isLoading,
    error: error ? getApiErrorMessage(error) : null,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      await refetch();
    },
  };
}
