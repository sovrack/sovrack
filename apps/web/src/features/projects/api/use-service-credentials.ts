"use client";

import { useQuery } from "@tanstack/react-query";
import { servicesService } from "@/features/projects/api/services.service";
import { projectKeys } from "@/features/projects/api/project-query-keys";

/**
 * Loads a DATABASE service's credentials from the dedicated, gated endpoint.
 * `enabled` guards it so nothing sensitive is fetched until the Credentials
 * panel is actually opened (never eagerly on the services list). Kept out of
 * cache-and-forget defaults so secrets don't linger longer than needed.
 */
export function useServiceCredentials(
  projectId: string,
  serviceId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: projectKeys.serviceCredentials(projectId, serviceId),
    queryFn: () => servicesService.getCredentials(projectId, serviceId),
    enabled: Boolean(projectId) && Boolean(serviceId) && enabled,
    staleTime: 0,
    gcTime: 0,
  });
}
