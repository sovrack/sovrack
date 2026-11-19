"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  serversService,
  type StartSetupPayload,
} from "@/features/servers/api/servers.service";
import {
  ACTIVE_SETUP_STATUSES,
  FINISHED_SETUP_STATUSES,
  serverKeys,
} from "./server-query-keys";

/**
 * Docker TLS connection status of a server (null = not configured). Used by
 * the server detail page to show "Connected" once the Setup Server flow (or a
 * manual registration) has registered the connection.
 */
export function useDockerConnection(id: string) {
  return useQuery({
    queryKey: serverKeys.dockerConnection(id),
    queryFn: () => serversService.getDockerConnection(id),
    enabled: Boolean(id),
    retry: false,
    // Poll lightly only while unconfigured, so the badge flips to "Connected"
    // by itself right after a Setup Server run registers the connection.
    refetchInterval: (query) => (query.state.data ? false : 15_000),
    refetchIntervalInBackground: false,
  });
}

export function useServerSetups(id: string) {
  return useQuery({
    queryKey: serverKeys.setups(id),
    queryFn: () => serversService.getSetups(id),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || !Array.isArray(data)) return 3_000;
      const hasActive = (data as Array<{ status: string }>).some((p) =>
        ACTIVE_SETUP_STATUSES.has(p.status),
      );
      return hasActive ? 3_000 : false;
    },
    refetchIntervalInBackground: false,
  });
}

export function useStartServerSetup(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: StartSetupPayload) =>
      serversService.startSetup(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: serverKeys.all });
      void queryClient.invalidateQueries({
        queryKey: serverKeys.setups(id),
      });
    },
  });
}

export function useSetup(id: string | null) {
  return useQuery({
    queryKey: id
      ? serverKeys.setup(id)
      : [...serverKeys.all, "setup", "none"],
    queryFn: () => serversService.getSetup(id ?? ""),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3_000;
      return FINISHED_SETUP_STATUSES.has(
        (data as { status: string }).status,
      )
        ? false
        : 3_000;
    },
    refetchIntervalInBackground: false,
  });
}

export function useSetupReadiness(id: string) {
  return useQuery({
    queryKey: serverKeys.setupReadiness(id),
    queryFn: () => serversService.getSetupReadiness(id),
    enabled: Boolean(id),
    refetchInterval: 8_000,
    refetchIntervalInBackground: false,
  });
}

export function useSetupLogs(setupId: string | null) {
  return useQuery({
    queryKey: setupId
      ? serverKeys.setupLogs(setupId)
      : [...serverKeys.all, "setup-logs", "none"],
    queryFn: () => serversService.getSetupLogs(setupId ?? ""),
    enabled: Boolean(setupId),
    refetchInterval: 2_000,
    refetchIntervalInBackground: false,
  });
}

export function useRetrySetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      serversService.retrySetup(id, reason),
    onSuccess: (setup) => {
      void queryClient.invalidateQueries({ queryKey: serverKeys.all });
      void queryClient.invalidateQueries({
        queryKey: serverKeys.setups(setup.serverId),
      });
    },
  });
}

export function useCancelSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => serversService.cancelSetup(id),
    onSuccess: (setup) => {
      void queryClient.invalidateQueries({ queryKey: serverKeys.all });
      void queryClient.invalidateQueries({
        queryKey: serverKeys.setups(setup.serverId),
      });
      queryClient.setQueryData(
        serverKeys.setup(setup.id),
        setup,
      );
    },
  });
}
