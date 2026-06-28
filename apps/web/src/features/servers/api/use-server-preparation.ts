'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { serversService, type PrepareServerPayload } from '@/features/servers/api/servers.service';
import {
  ACTIVE_PREPARATION_STATUSES,
  FINISHED_PREPARATION_STATUSES,
  serverKeys,
} from './server-query-keys';

export function useServerPreparations(id: string) {
  return useQuery({
    queryKey: serverKeys.preparations(id),
    queryFn: () => serversService.getPreparations(id),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || !Array.isArray(data)) return 3_000;
      const hasActive = (data as Array<{ status: string }>).some((p) =>
        ACTIVE_PREPARATION_STATUSES.has(p.status),
      );
      return hasActive ? 3_000 : false;
    },
    refetchIntervalInBackground: false,
  });
}

export function useStartServerPreparation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PrepareServerPayload) => serversService.prepare(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serverKeys.all });
      void queryClient.invalidateQueries({ queryKey: serverKeys.preparations(id) });
    },
  });
}

export function useServerPreparationOptions() {
  return useQuery({
    queryKey: serverKeys.preparationOptions(),
    queryFn: () => serversService.getPreparationOptions(),
    staleTime: 60_000,
  });
}

export function usePreparation(id: string | null) {
  return useQuery({
    queryKey: id ? serverKeys.preparation(id) : [...serverKeys.all, 'preparation', 'none'],
    queryFn: () => serversService.getPreparation(id ?? ''),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3_000;
      return FINISHED_PREPARATION_STATUSES.has((data as { status: string }).status)
        ? false
        : 3_000;
    },
    refetchIntervalInBackground: false,
  });
}

export function usePreparationReadiness(id: string) {
  return useQuery({
    queryKey: serverKeys.preparationReadiness(id),
    queryFn: () => serversService.getPreparationReadiness(id),
    enabled: Boolean(id),
    refetchInterval: 8_000,
    refetchIntervalInBackground: false,
  });
}

export function usePreparationLogs(preparationId: string | null) {
  return useQuery({
    queryKey: preparationId
      ? serverKeys.preparationLogs(preparationId)
      : [...serverKeys.all, 'preparation-logs', 'none'],
    queryFn: () => serversService.getPreparationLogs(preparationId ?? ''),
    enabled: Boolean(preparationId),
    refetchInterval: 2_000,
    refetchIntervalInBackground: false,
  });
}

export function useRetryPreparation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      serversService.retryPreparation(id, reason),
    onSuccess: (preparation) => {
      void queryClient.invalidateQueries({ queryKey: serverKeys.all });
      void queryClient.invalidateQueries({
        queryKey: serverKeys.preparations(preparation.serverId),
      });
    },
  });
}

export function useCancelPreparation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => serversService.cancelPreparation(id),
    onSuccess: (preparation) => {
      void queryClient.invalidateQueries({ queryKey: serverKeys.all });
      void queryClient.invalidateQueries({
        queryKey: serverKeys.preparations(preparation.serverId),
      });
      queryClient.setQueryData(
        serverKeys.preparation(preparation.id),
        preparation,
      );
    },
  });
}
