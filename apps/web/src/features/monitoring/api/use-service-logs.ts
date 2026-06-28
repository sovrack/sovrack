'use client';

import { useQuery } from '@tanstack/react-query';
import { logsService } from '@/features/monitoring/api/logs.service';

export type ServiceLogsQuery = {
  /** Fenêtre = maintenant − fromMinutes. */
  fromMinutes: number;
  search?: string;
  limit?: number;
};

/**
 * Logs historiques (Loki) d'un service×env. Inactif tant que `serviceEnvId`
 * est null. La fenêtre temporelle est calculée côté client à partir du preset.
 */
export function useServiceLogs(serviceEnvId: string | null, query: ServiceLogsQuery) {
  return useQuery({
    queryKey: ['service-logs', serviceEnvId, query],
    queryFn: () => {
      const to = new Date();
      const from = new Date(to.getTime() - query.fromMinutes * 60_000);
      return logsService.searchPersisted(serviceEnvId as string, {
        from: from.toISOString(),
        to: to.toISOString(),
        search: query.search?.trim() || undefined,
        limit: query.limit,
      });
    },
    enabled: Boolean(serviceEnvId),
  });
}
