'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { serversService, type PrepareServerPayload } from '@/services/servers.service';
import type { CreateServerPayload, UpdateServerPayload } from '@/types/server';

export const serverKeys = {
  all: ['servers'] as const,
  list: () => [...serverKeys.all, 'list'] as const,
  detail: (id: string) => [...serverKeys.all, 'detail', id] as const,
  preparationOptions: () => [...serverKeys.all, 'preparation-options'] as const,
  preparation: (id: string) => [...serverKeys.all, 'preparation', id] as const,
  capabilities: (id: string) => [...serverKeys.all, 'capabilities', id] as const,
  installedTools: (id: string) => [...serverKeys.all, 'installed-tools', id] as const,
  preparations: (id: string) => [...serverKeys.all, 'preparations', id] as const,
  preparationReadiness: (id: string) =>
    [...serverKeys.all, 'preparation-readiness', id] as const,
  validationResults: (id: string) => [...serverKeys.all, 'validation-results', id] as const,
  preparationLogs: (id: string) => [...serverKeys.all, 'preparation-logs', id] as const,
  auditEvents: (id: string) => [...serverKeys.all, 'audit-events', id] as const,
};

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

export function useValidateServerSsh(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => serversService.verify(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: serverKeys.all }),
  });
}

export function useDetectServerInfo(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => serversService.detect(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: serverKeys.all }),
  });
}

export function useServerCapabilities(id: string) {
  return useQuery({
    queryKey: serverKeys.capabilities(id),
    queryFn: () => serversService.getCapabilities(id),
    enabled: Boolean(id),
  });
}

export function useInstalledTools(id: string) {
  return useQuery({
    queryKey: serverKeys.installedTools(id),
    queryFn: () => serversService.getInstalledTools(id),
    enabled: Boolean(id),
  });
}

export function useServerValidationResults(id: string) {
  return useQuery({
    queryKey: serverKeys.validationResults(id),
    queryFn: () => serversService.getValidationResults(id),
    enabled: Boolean(id),
  });
}

export function useServerAuditEvents(id: string) {
  return useQuery({
    queryKey: serverKeys.auditEvents(id),
    queryFn: () => serversService.getAuditEvents(id),
    enabled: Boolean(id),
    refetchInterval: 5000,
  });
}

export function useServerPreparations(id: string) {
  return useQuery({
    queryKey: serverKeys.preparations(id),
    queryFn: () => serversService.getPreparations(id),
    enabled: Boolean(id),
    refetchInterval: 3000,
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
    refetchInterval: 3_000,
  });
}

export function usePreparationReadiness(id: string) {
  return useQuery({
    queryKey: serverKeys.preparationReadiness(id),
    queryFn: () => serversService.getPreparationReadiness(id),
    enabled: Boolean(id),
    refetchInterval: 5000,
  });
}

export function usePreparationLogs(preparationId: string | null) {
  return useQuery({
    queryKey: preparationId
      ? serverKeys.preparationLogs(preparationId)
      : [...serverKeys.all, 'preparation-logs', 'none'],
    queryFn: () => serversService.getPreparationLogs(preparationId ?? ''),
    enabled: Boolean(preparationId),
    refetchInterval: 2000,
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
