'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sshKeysService } from '@/services/ssh-keys.service';
import { getApiErrorMessage } from '@/lib/api';

/** Clés SSH de l'utilisateur. */
export function useSshKeys() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ssh-keys'],
    queryFn: () => sshKeysService.getAll(),
  });

  return {
    sshKeys: data ?? [],
    loading: isLoading,
    error: error ? getApiErrorMessage(error) : null,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ssh-keys'] });
      await refetch();
    },
  };
}
