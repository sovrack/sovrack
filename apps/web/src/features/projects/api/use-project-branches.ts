"use client";

import { useQuery } from "@tanstack/react-query";
import { projectsService } from "@/features/projects/api/projects.service";
import { projectKeys } from "@/features/projects/api/project-query-keys";

/**
 * F-1 fix: React Query hook for Git branches of a project.
 * Shared cache key — multiple consumers (DeployDialog, ServiceConfigForm)
 * will deduplicate the network request automatically.
 *
 * B3 fix: `serviceId` scopes both the request AND the cache key to a
 * specific GIT service — a project can hold several (1 service = 1 repo).
 * Pass it whenever the caller knows which service it concerns (both current
 * consumers do); omitting it falls back to the backend's own deterministic
 * (but still ambiguous for a multi-service project) resolution.
 */
export function useProjectBranches(
  projectId: string,
  enabled = true,
  serviceId?: string,
) {
  return useQuery({
    queryKey: projectKeys.branches(projectId, serviceId),
    queryFn: () =>
      projectsService.getBranches(projectId, undefined, serviceId).catch(() => []),
    enabled: Boolean(projectId) && enabled,
    staleTime: 30_000,
  });
}
