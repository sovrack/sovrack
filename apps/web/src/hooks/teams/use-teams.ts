'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { teamsService } from '@/services/teams.service';
import { getApiErrorMessage } from '@/lib/api';

/** Liste des équipes (React Query — cache + invalidation centralisés). */
export function useTeams() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsService.getAll(),
  });

  return {
    teams: data ?? [],
    loading: isLoading,
    error: error ? getApiErrorMessage(error) : null,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['teams'] });
      await refetch();
    },
  };
}
