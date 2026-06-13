'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usersService } from '@/services/users.service';
import { getApiErrorMessage } from '@/lib/api';

/** Liste des utilisateurs (admin). */
export function useUsers() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersService.getAll(),
  });

  return {
    users: data ?? [],
    loading: isLoading,
    error: error ? getApiErrorMessage(error) : null,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await refetch();
    },
  };
}
