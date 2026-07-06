"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  RefreshCw,
  Server as ServerIcon,
  XCircle,
} from "lucide-react";
import { monitoringService } from "@/features/monitoring";
import { getApiErrorMessage } from "@/shared/lib/api";
import { PageHeader } from "@/shared/layout/page-header";
import { ProtectedRoute } from "@/shared/common/protected-route";
import { useI18n } from "@/shared/i18n/language-context";
import { useToast } from "@/shared/contexts/toast-context";
import type { MonitoredServer } from "@/features/monitoring";
import { ServerMonitoringActionsMenu } from "@/features/monitoring/components/server-monitoring-actions-menu";

const HEALTH_TONE: Record<string, string> = {
  HEALTHY: "border-green-500/30 bg-green-500/10 text-green-400",
  WARNING: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  CRITICAL: "border-red-500/30 bg-red-500/10 text-red-400",
  UNKNOWN: "border-[var(--border)] bg-[var(--hover)] text-[var(--text-muted)]",
};

function pct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(0)}%`;
}

function ServerRow({
  server,
  onSetup,
  settingUp,
}: {
  server: MonitoredServer;
  onSetup: (serverId: string) => void;
  settingUp: boolean;
}) {
  const router = useRouter();

  const handleOpenGrafana = () => {
    if (server.links?.grafanaUrl) {
      window.open(server.links.grafanaUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleOpenPrometheus = () => {
    if (server.links?.prometheusUrl) {
      window.open(server.links.prometheusUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleOpenLoki = () => {
    if (server.links?.lokiUrl) {
      window.open(server.links.lokiUrl, '_blank', 'noopener,noreferrer');
    }
  };

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
        {/* Actions menu */}
        <ServerMonitoringActionsMenu
          server={server}
          disabled={settingUp}
          onOpenGrafana={handleOpenGrafana}
          onOpenPrometheus={handleOpenPrometheus}
          onOpenLoki={handleOpenLoki}
          onSetupMonitoring={() => onSetup(server.serverId)}
          onViewDetails={() => router.push(`/admin/servers/${server.serverId}`)}
        />
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
  return (
    <ProtectedRoute requiredRole="ADMIN">
      <MonitoringPageBody />
    </ProtectedRoute>
  );
}

function MonitoringPageBody() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["monitoring-servers"],
    queryFn: () => monitoringService.getServers(),
    // 10s tant qu'une installation est en cours (le run Ansible dure
    // plusieurs minutes ; la ligne bascule dès monitoringInstalledAt posé).
    refetchInterval: installingIds.size > 0 ? 10_000 : 30_000,
    refetchOnWindowFocus: false,
  });

  const installMutation = useMutation({
    mutationFn: (serverId: string) =>
      monitoringService.installMonitoring({
        actionKey: "install_monitoring_stack",
        serverIds: [serverId],
      }),
    onSuccess: (_run, serverId) => {
      setInstallingIds((prev) => new Set(prev).add(serverId));
      toast(
        t(
          "Setup Monitoring started — the dashboards will appear here once the run completes (a few minutes).",
        ),
        "success",
      );
      void queryClient.invalidateQueries({ queryKey: ["monitoring-servers"] });
    },
    onError: (e) => toast(getApiErrorMessage(e), "error"),
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
            <ServerRow
              key={server.serverId}
              server={server}
              settingUp={
                installingIds.has(server.serverId) || installMutation.isPending
              }
              onSetup={(id) => installMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
