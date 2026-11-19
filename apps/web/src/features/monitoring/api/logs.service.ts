import api from "@/shared/lib/api";
import type { LokiSearchResult } from "@/features/monitoring/types/logs";

export const logsService = {
  /**
   * Recherche les logs HISTORIQUES (Loki) d'un service×env sur une fenêtre.
   * Si Loki n'est pas configuré, le backend renvoie `configured=false`.
   */
  async searchPersisted(
    serviceEnvId: string,
    params: { from?: string; to?: string; search?: string; limit?: number },
  ): Promise<LokiSearchResult> {
    const res = await api.get<LokiSearchResult>(
      `/runtime-logs/service/${serviceEnvId}/history`,
      { params },
    );
    return res.data;
  },
};
