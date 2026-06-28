/** Une ligne de log persistée (Loki). `ts` en millisecondes. */
export type LokiLogEntry = {
  ts: number;
  line: string;
  labels?: Record<string, string>;
};

/** Résultat d'une recherche de logs historiques (Loki) pour un service×env. */
export type LokiSearchResult = {
  /** Loki est-il configuré côté plateforme ? Sinon l'UI bascule sur le tail live. */
  configured: boolean;
  reachable: boolean;
  serviceEnvId: string;
  from: number;
  to: number;
  total: number;
  entries: LokiLogEntry[];
  message?: string;
};
