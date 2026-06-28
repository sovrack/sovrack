'use client';

import { useQuery } from '@tanstack/react-query';
import { projectsService } from '@/features/projects/api/projects.service';

/**
 * Matrice de déploiement d'un projet (GET /projects/:id/matrix) : services ×
 * environnements, chaque cellule = un ServiceEnvironment avec l'état de sa
 * release courante + drapeau OutOfSync. Rafraîchie périodiquement (le statut
 * live évolue avec les déploiements et le réconciliateur).
 */
export function useProjectMatrix(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId, 'matrix'],
    queryFn: () => projectsService.getMatrix(projectId),
    enabled: Boolean(projectId),
    refetchInterval: 15_000,
  });
}
