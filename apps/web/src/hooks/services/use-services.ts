'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { servicesService } from '@/services/services.service';
import { getApiErrorMessage } from '@/lib/api';

/** Services (composants) d'un projet. */
export function useServices(projectId: string) {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['services', projectId],
    queryFn: () => servicesService.getAll(projectId),
    enabled: Boolean(projectId),
  });

  return {
    services: data ?? [],
    loading: isLoading,
    error: error ? getApiErrorMessage(error) : null,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['services', projectId] });
      await refetch();
    },
  };
}
