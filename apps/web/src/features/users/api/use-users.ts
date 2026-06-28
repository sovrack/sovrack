'use client';

import { useQuery } from '@tanstack/react-query';
import { usersService } from '@/features/users/api/users.service';

/** Liste des utilisateurs (cache partagé via la clé `['users']`). */
export function useUsers(enabled = true) {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => usersService.getAll(),
    enabled,
  });
}
