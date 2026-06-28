'use client';

import { useQuery } from '@tanstack/react-query';
import { deploymentsService } from '@/features/deployments/api/deployments.service';

/**
 * Variables qui SERONT injectées dans le conteneur pour une instance service×env,
 * avant de confirmer un déploiement. Inactif tant que `serviceEnvId` est null.
 */
export function useEnvPreview(serviceEnvId: string | null) {
  return useQuery({
    queryKey: ['env-preview', serviceEnvId],
    queryFn: () => deploymentsService.previewEnv(serviceEnvId as string),
    enabled: Boolean(serviceEnvId),
  });
}
