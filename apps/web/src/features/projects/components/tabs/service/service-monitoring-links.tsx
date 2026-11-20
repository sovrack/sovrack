"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, ExternalLink, ScrollText } from "lucide-react";
import { monitoringService } from "@/features/monitoring";

/**
 * B5 (plan produit final) : liens Grafana/Prometheus/Loki du SERVEUR qui
 * héberge le service-environnement sélectionné — résolus par serveur
 * (Server.monitoringInstalledAt), fallback config plateforme. Affiché en tête
 * de l'onglet Monitoring ; si la stack n'est pas installée, on guide vers
 * Setup Monitoring au lieu d'un lien mort.
 */
export function ServiceMonitoringLinks({
  serviceEnvId,
}: {
  serviceEnvId: string | null;
}) {
  const { data } = useQuery({
    queryKey: ["service-monitoring-links", serviceEnvId],
    queryFn: () => monitoringService.getServiceMonitoringLinks(serviceEnvId!),
    enabled: Boolean(serviceEnvId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (!serviceEnvId || !data) return null;

  if (!data.installed) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-hover/10/40 px-4 py-2.5 text-xs text-secondary">
        <Activity size={13} className="shrink-0" />
        Monitoring stack not installed on this server
        {data.serverHost ? ` (${data.serverHost})` : ""} — install it from
        Servers → Setup Server → Setup Monitoring to unlock Grafana dashboards
        and history charts.
      </div>
    );
  }

  const linkClass =
    "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-hover/10";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
        Server monitoring
        {data.serverHost ? ` — ${data.serverHost}` : ""}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {data.grafanaUrl && (
          <a
            href={data.grafanaUrl}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            <BarChart3 size={12} /> Open Grafana <ExternalLink size={10} />
          </a>
        )}
        {data.prometheusUrl && (
          <a
            href={data.prometheusUrl}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            <Activity size={12} /> Prometheus <ExternalLink size={10} />
          </a>
        )}
        {data.lokiUrl && (
          <a
            href={data.lokiUrl}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            <ScrollText size={12} /> Loki <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}
