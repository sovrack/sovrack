/** Date courte fr-FR (jj/mm/aaaa). Retourne '-' si la date est invalide. */
export function formatDate(value: string): string {
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(asDate);
}

/**
 * Temps relatif anglais : « just now » / « 5m ago » / « 3h ago » / « 2d ago ».
 * Retourne « — » si la valeur est absente/invalide. Source UNIQUE (avant :
 * réimplémenté dans ~5 composants).
 */
export function timeAgo(value: string | null | undefined): string {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "—";
  const m = Math.floor((Date.now() - t) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Variante COMPACTE (sans « ago », jours en « j ») pour les zones denses comme
 * la cloche de notifications : « just now » / « 5m » / « 3h » / « 2j ».
 */
export function timeAgoCompact(value: string | null | undefined): string {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "—";
  const m = Math.floor((Date.now() - t) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}

/** Taille lisible : « — » / « 512 B » / « 1.5 KB » / « 2.0 MB ». */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
