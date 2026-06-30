"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { serversService } from "@/features/servers/api/servers.service";
import { serverKeys } from "./server-query-keys";

export function useValidateServerSsh(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => serversService.verify(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: serverKeys.all }),
  });
}

export function useDetectServerInfo(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => serversService.detect(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: serverKeys.all }),
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
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}
