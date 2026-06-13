'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { monitoringService } from '@/services/monitoring.service';
import { getApiErrorMessage } from '@/lib/api';

/** Vue d'ensemble du monitoring (métriques agrégées). */
export function useMonitoringOverview() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['monitoring', 'overview'],
    queryFn: () => monitoringService.getOverview(),
  });

  return {
    overview: data ?? null,
    loading: isLoading,
    error: error ? getApiErrorMessage(error) : null,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['monitoring', 'overview'] });
      await refetch();
    },
  };
}
