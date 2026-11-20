"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, BarChart3, ScrollText, Wrench } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { monitoringService } from "@/features/monitoring";
import { getApiErrorMessage } from "@/shared/lib/api";
import { useToast } from "@/shared/contexts/toast-context";
import type { Server } from "@/features/servers/types/server";

function pct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(0)}%`;
}

type ServerMonitoringDialogProps = {
  open: boolean;
  server: Server | null;
  onClose: () => void;
  onInstallMonitoring: (serverId: string) => Promise<void>;
};

/**
 * Remplace l'ancienne page /admin/monitoring : une action par serveur
 * (liens Grafana/Prometheus/Loki si installé, sinon bouton d'installation),
 * plutôt qu'une vue globale séparée.
 */
export function ServerMonitoringDialog({
  open,
  server,
  onClose,
  onInstallMonitoring,
}: ServerMonitoringDialogProps) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["monitoring-servers"],
    queryFn: () => monitoringService.getServers(),
    enabled: open,
    refetchInterval: open ? 10_000 : false,
    refetchOnWindowFocus: false,
  });

  const monitored = data?.find((s) => s.serverId === server?.id) ?? null;
  const installed = Boolean(monitored?.links);

  const installMutation = useMutation({
    mutationFn: () => onInstallMonitoring(server?.id ?? ""),
    onSuccess: () => {
      toast(
        "Monitoring stack installation started — dashboards will appear here in a few minutes.",
        "success",
      );
      void queryClient.invalidateQueries({ queryKey: ["monitoring-servers"] });
    },
    onError: (e) => toast(getApiErrorMessage(e), "error"),
  });

  if (!server) return null;

  const openLink = (url?: string | null) => {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Monitoring"
      description={`${server.username}@${server.host}`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        {isLoading && (
          <p className="text-sm text-secondary">Loading…</p>
        )}

        {!isLoading && !installed && (
          <div className="rounded-lg border border-border bg-hover/10 p-4">
            <p className="mb-3 text-sm text-secondary">
              Grafana, Prometheus and Loki are not installed on this server
              yet.
            </p>
            <Button
              onClick={() => installMutation.mutate()}
              loading={installMutation.isPending}
              icon={
                installMutation.isPending ? undefined : <Wrench size={14} />
              }
            >
              Setup Monitoring
            </Button>
          </div>
        )}

        {!isLoading && installed && monitored && (
          <div className="space-y-3">
            <div className="flex items-center gap-4 rounded-lg border border-border bg-hover/10 px-4 py-3 font-mono text-xs text-secondary">
              <span>CPU {pct(monitored.metrics.cpuPercent)}</span>
              <span>MEM {pct(monitored.metrics.memoryPercent)}</span>
              <span>DISK {pct(monitored.metrics.diskPercent)}</span>
            </div>
            <div className="grid gap-2">
              <Button
                variant="secondary"
                icon={<BarChart3 size={14} />}
                onClick={() => openLink(monitored.links?.grafanaUrl)}
              >
                Open Grafana
              </Button>
              <Button
                variant="secondary"
                icon={<Activity size={14} />}
                onClick={() => openLink(monitored.links?.prometheusUrl)}
              >
                Open Prometheus
              </Button>
              <Button
                variant="secondary"
                icon={<ScrollText size={14} />}
                onClick={() => openLink(monitored.links?.lokiUrl)}
              >
                Open Loki
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
