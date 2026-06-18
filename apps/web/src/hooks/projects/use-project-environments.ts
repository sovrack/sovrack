'use client';

import { useQuery } from '@tanstack/react-query';
import { environmentsService } from '@/services/environments.service';

/**
 * React Query source for a project's environments
 * (GET /projects/:id/environments). Shared by the project page and the deploy
 * dialog via the same query key, so React Query dedupes the two fetches that
 * previously hit the network independently — see PLAN_AMELIORATION.md §4.2/§4.3.
 */
export function useProjectEnvironments(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId, 'environments'],
    queryFn: () => environmentsService.getAll(projectId),
    enabled: Boolean(projectId),
    staleTime: 10_000,
  });
}
