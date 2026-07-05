"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  ExternalLink,
  Loader2,
  RefreshCw,
  ScrollText,
  Server as ServerIcon,
  XCircle,
} from "lucide-react";
import { monitoringService } from "@/features/monitoring";
import { getApiErrorMessage } from "@/shared/lib/api";
import { PageHeader } from "@/shared/layout/page-header";
import { useI18n } from "@/shared/i18n/language-context";
import type { MonitoredServer } from "@/features/monitoring";

const HEALTH_TONE: Record<string, string> = {
  HEALTHY: "border-green-500/30 bg-green-500/10 text-green-400",
  WARNING: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  CRITICAL: "border-red-500/30 bg-red-500/10 text-red-400",
  UNKNOWN: "border-[var(--border)] bg-[var(--hover)] text-[var(--text-muted)]",
};

function pct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(0)}%`;
}

function ServerRow({ server }: { server: MonitoredServer }) {
  const { t } = useI18n();
  const linkClass =
    "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--hover)]";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border)] px-4 py-3 first:border-t-0">
      <div className="flex min-w-0 basis-56 items-center gap-2.5">
        <ServerIcon size={16} className="shrink-0 text-[var(--text-secondary)]" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {server.name}
          </p>
          <p className="truncate font-mono text-xs text-[var(--text-muted)]">
            {server.host}
          </p>
        </div>
      </div>

      <span
        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${HEALTH_TONE[server.monitoringStatus] ?? HEALTH_TONE.UNKNOWN}`}
      >
        {server.monitoringStatus}
      </span>

      <div className="flex items-center gap-3 font-mono text-xs text-[var(--text-secondary)]">
        <span>CPU {pct(server.metrics.cpuPercent)}</span>
        <span>MEM {pct(server.metrics.memoryPercent)}</span>
        <span>DISK {pct(server.metrics.diskPercent)}</span>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {server.links ? (
          <>
            <a
              href={server.links.grafanaUrl}
              target="_blank"
              rel="noreferrer"
              className={linkClass}
            >
              <BarChart3 size={12} /> Grafana <ExternalLink size={10} />
            </a>
            <a
              href={server.links.prometheusUrl}
              target="_blank"
              rel="noreferrer"
              className={linkClass}
            >
              <Activity size={12} /> Prometheus <ExternalLink size={10} />
            </a>
            <a
              href={server.links.lokiUrl}
              target="_blank"
              rel="noreferrer"
              className={linkClass}
            >
              <ScrollText size={12} /> Loki <ExternalLink size={10} />
            </a>
          </>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">
            {t("Monitoring stack not installed")} —{" "}
            {t("install it from Servers → Setup Server → Setup Monitoring.")}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * E2 (plan produit final) : vue monitoring PAR SERVEUR — statut de santé,
 * métriques instantanées et liens Grafana/Prometheus/Loki de chaque serveur
 * dont la stack est installée (Server.monitoringInstalledAt). Vue globale
 * admin, complémentaire du bandeau contextuel de l'onglet Monitoring d'un
 * service.
 */
export default function InfrastructureMonitoringPage() {
  const { t } = useI18n();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["monitoring-servers"],
    queryFn: () => monitoringService.getServers(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  const servers = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Infrastructure"
        title={t("Monitoring")}
        description={t(
          "Per-server health, live metrics and dashboards (Grafana / Prometheus / Loki).",
        )}
        actions={
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] transition hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          </button>
        }
      />

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <XCircle size={14} /> {getApiErrorMessage(error)}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-8 text-sm text-[var(--text-secondary)]">
          <Loader2 size={14} className="animate-spin" /> {t("Loading…")}
        </div>
      )}

      {!isLoading && !error && servers.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-14 text-center">
          <ServerIcon size={26} className="mb-3 text-[var(--text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {t("No servers")}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {t("Add a server from Infrastructure → Servers to monitor it.")}
          </p>
        </div>
      )}

      {servers.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
          {servers.map((server) => (
            <ServerRow key={server.serverId} server={server} />
          ))}
        </div>
      )}
    </div>
  );
}
