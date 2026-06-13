'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { platformConfigService } from '@/services/platform-config.service';
import { getApiErrorMessage } from '@/lib/api';

/** Configuration plateforme (réglages globaux). */
export function usePlatformConfig() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['platform-config'],
    queryFn: () => platformConfigService.getAll(),
  });

  return {
    config: data ?? [],
    loading: isLoading,
    error: error ? getApiErrorMessage(error) : null,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['platform-config'] });
      await refetch();
    },
  };
}
