"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type Query,
} from "@tanstack/react-query";
import { serversService } from "@/features/servers/api/servers.service";
import type {
  CreateServerPayload,
  Server,
  UpdateServerPayload,
} from "@/features/servers/types/server";
import { serverKeys } from "./server-query-keys";

export function useServers() {
  return useQuery({
    queryKey: serverKeys.list(),
    queryFn: () => serversService.getAll(),
    staleTime: 10_000,
  });
}

export function useServer(
  id: string,
  options?: {
    refetchInterval?: number | ((query: Query<Server>) => number | false);
  },
) {
  return useQuery({
    queryKey: serverKeys.detail(id),
    queryFn: () => serversService.getById(id),
    enabled: Boolean(id),
    staleTime: 10_000,
    // Optional short poll — used while waiting on a background step (e.g.
    // auto-detection right after SSH validation) so the page reflects it
    // finishing without a manual refresh. Undefined = no polling (default).
    refetchInterval: options?.refetchInterval,
  });
}

// A3: live reachability indicator for the servers list — a lightweight TCP
// ping, refreshed automatically while the page stays open. Deliberately a
// separate query from useServers()/isVerified (the last on-demand SSH
// validation result): the two must coexist without either overwriting the
// other's signal.
export function useServersReachability() {
  return useQuery({
    queryKey: serverKeys.reachability(),
    queryFn: () => serversService.getReachability(),
    staleTime: 20_000,
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
  });
}

export function useCreateServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateServerPayload) =>
      serversService.create(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: serverKeys.all }),
  });
}

export function useUpdateServer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateServerPayload) =>
      serversService.update(id, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: serverKeys.all }),
  });
}
