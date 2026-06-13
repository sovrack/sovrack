'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard.service';
import { getApiErrorMessage } from '@/lib/api';

/** Statistiques du dashboard (agrégats home). */
export function useDashboardStats() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => dashboardService.getStats(),
  });

  return {
    stats: data ?? null,
    loading: isLoading,
    error: error ? getApiErrorMessage(error) : null,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
      await refetch();
    },
  };
}
