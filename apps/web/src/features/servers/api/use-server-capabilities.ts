"use client";

import { useQuery } from "@tanstack/react-query";
import { serversService } from "@/features/servers/api/servers.service";
import { serverKeys } from "./server-query-keys";

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
