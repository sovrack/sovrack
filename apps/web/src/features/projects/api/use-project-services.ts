'use client';

import { useQuery } from '@tanstack/react-query';
import { servicesService } from '@/features/projects/api/services.service';

/**
 * Source de vérité React Query pour la liste des services d'un projet
 * (GET /projects/:id/services). À utiliser partout au lieu de parser
 * `project.env.services` (legacy JSON) — voir PLAN_AMELIORATION.md §0.1 / §0.1bis.
 */
export function useProjectServices(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId, 'services'],
    queryFn: () => servicesService.getAll(projectId),
    enabled: Boolean(projectId),
  });
}
