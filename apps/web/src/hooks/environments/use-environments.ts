'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { environmentsService } from '@/services/environments.service';
import { getApiErrorMessage } from '@/lib/api';

/** Environnements d'un projet. */
export function useEnvironments(projectId: string) {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['environments', projectId],
    queryFn: () => environmentsService.getAll(projectId),
    enabled: Boolean(projectId),
  });

  return {
    environments: data ?? [],
    loading: isLoading,
    error: error ? getApiErrorMessage(error) : null,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['environments', projectId] });
      await refetch();
    },
  };
}
