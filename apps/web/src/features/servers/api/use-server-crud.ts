'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { serversService } from '@/features/servers/api/servers.service';
import type { CreateServerPayload, UpdateServerPayload } from '@/features/servers/types/server';
import { serverKeys } from './server-query-keys';

export function useServers() {
  return useQuery({
    queryKey: serverKeys.list(),
    queryFn: () => serversService.getAll(),
    staleTime: 10_000,
  });
}

export function useServer(id: string) {
  return useQuery({
    queryKey: serverKeys.detail(id),
    queryFn: () => serversService.getById(id),
    enabled: Boolean(id),
    staleTime: 10_000,
  });
}

export function useCreateServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateServerPayload) => serversService.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: serverKeys.all }),
  });
}

export function useUpdateServer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateServerPayload) => serversService.update(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: serverKeys.all }),
  });
}
