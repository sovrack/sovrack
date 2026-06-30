"use client";

import { useQuery } from "@tanstack/react-query";
import { projectsService } from "@/features/projects/api/projects.service";
import { projectKeys } from "@/features/projects/api/project-query-keys";

/**
 * F-1 fix: React Query hook for Git branches of a project.
 * Shared cache key — multiple consumers (DeployDialog, ServiceConfigForm)
 * will deduplicate the network request automatically.
 */
export function useProjectBranches(projectId: string, enabled = true) {
  return useQuery({
    queryKey: projectKeys.branches(projectId),
    queryFn: () => projectsService.getBranches(projectId).catch(() => []),
    enabled: Boolean(projectId) && enabled,
    staleTime: 30_000,
  });
}
