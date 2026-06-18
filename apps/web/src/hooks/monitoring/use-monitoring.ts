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

/** Page monitoring complète : overview + serveurs + alertes (1 seul cycle). */
export function useMonitoring() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['monitoring', 'all'],
    queryFn: async () => {
      const [overview, servers, alerts] = await Promise.all([
        monitoringService.getOverview(),
        monitoringService.getServers(),
        monitoringService.getAlerts(),
      ]);
      return { overview, servers, alerts };
    },
  });

  return {
    overview: data?.overview ?? null,
    servers: data?.servers ?? [],
    alerts: data?.alerts ?? null,
    loading: isLoading,
    error: error ? getApiErrorMessage(error) : null,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['monitoring', 'all'] });
      await refetch();
    },
  };
}
