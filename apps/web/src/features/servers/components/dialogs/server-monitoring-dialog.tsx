"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, BarChart3, Box, Cpu, HardDrive, MemoryStick, ScrollText, Wrench } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { monitoringService } from "@/features/monitoring";
import api, { getApiErrorMessage } from "@/shared/lib/api";
import { useToast } from "@/shared/contexts/toast-context";
import type { Server } from "@/features/servers/types/server";

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

  const { data: telemetry } = useQuery<{
    connected: boolean;
    lastPingAt: string | null;
    hostInfo: {
      hostname?: string;
      os?: string;
      platform?: string;
      arch?: string;
      kernel?: string;
      uptime?: number;
    } | null;
    metrics: {
      cpuPercent: number;
      memoryPercent: number;
      memoryUsedBytes: number;
      memoryTotalBytes: number;
      diskPercent: number;
      diskUsedBytes: number;
      diskTotalBytes: number;
      containerCount: number;
      timestamp: string;
    } | null;
  }>({
    queryKey: ["server-telemetry", server?.id],
    queryFn: async () => {
      const res = await api.get(`/servers/${server?.id}/telemetry`);
      return res.data;
    },
    enabled: Boolean(open && server?.id),
    refetchInterval: open ? 3_000 : false,
    refetchOnWindowFocus: true,
  });

  const [history, setHistory] = useState<Array<{ time: string; cpu: number; mem: number }>>([]);

  useEffect(() => {
    if (telemetry?.metrics) {
      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setHistory((prev) => {
        const next = [...prev, { time: now, cpu: telemetry.metrics!.cpuPercent, mem: telemetry.metrics!.memoryPercent }];
        return next.slice(-20);
      });
    }
  }, [telemetry?.metrics]);

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
        {/* Live Agent Telemetry */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${telemetry?.connected ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                {telemetry?.connected ? "Agent Sovrack En Ligne (WebSocket TLS)" : "Agent Sovrack Hors Ligne"}
              </span>
            </div>
            {telemetry?.hostInfo && (
              <span className="text-[11px] text-muted font-mono">
                {telemetry.hostInfo.os} / {telemetry.hostInfo.arch}
              </span>
            )}
          </div>

          {telemetry?.connected && telemetry.metrics ? (
            <div className="space-y-3 pt-2">
              {/* CPU */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="flex items-center gap-1.5 text-secondary">
                    <Cpu size={13} className="text-accent" /> Processeur (CPU)
                  </span>
                  <span className="font-mono font-medium text-primary">
                    {telemetry.metrics.cpuPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-hover/20 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      telemetry.metrics.cpuPercent > 85 ? "bg-red-500" : telemetry.metrics.cpuPercent > 60 ? "bg-amber-400" : "bg-accent"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, telemetry.metrics.cpuPercent))}%` }}
                  />
                </div>
              </div>

              {/* Memory */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="flex items-center gap-1.5 text-secondary">
                    <MemoryStick size={13} className="text-accent" /> Mémoire Vive (RAM)
                  </span>
                  <span className="font-mono font-medium text-primary">
                    {(telemetry.metrics.memoryUsedBytes / (1024 * 1024 * 1024)).toFixed(1)} / {(telemetry.metrics.memoryTotalBytes / (1024 * 1024 * 1024)).toFixed(1)} Go ({telemetry.metrics.memoryPercent.toFixed(0)}%)
                  </span>
                </div>
                <div className="h-1.5 w-full bg-hover/20 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      telemetry.metrics.memoryPercent > 85 ? "bg-red-500" : telemetry.metrics.memoryPercent > 70 ? "bg-amber-400" : "bg-accent"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, telemetry.metrics.memoryPercent))}%` }}
                  />
                </div>
              </div>

              {/* Disk */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="flex items-center gap-1.5 text-secondary">
                    <HardDrive size={13} className="text-accent" /> Espace Disque
                  </span>
                  <span className="font-mono font-medium text-primary">
                    {(telemetry.metrics.diskUsedBytes / (1024 * 1024 * 1024)).toFixed(1)} / {(telemetry.metrics.diskTotalBytes / (1024 * 1024 * 1024)).toFixed(1)} Go ({telemetry.metrics.diskPercent.toFixed(0)}%)
                  </span>
                </div>
                <div className="h-1.5 w-full bg-hover/20 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      telemetry.metrics.diskPercent > 90 ? "bg-red-500" : "bg-accent"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, telemetry.metrics.diskPercent))}%` }}
                  />
                </div>
              </div>

              {/* Real-time Time Series Telemetry Curves */}
              {history.length > 1 && (
                <div className="pt-2">
                  <div className="flex items-center justify-between text-xs text-muted mb-1.5 font-medium">
                    <span>Télémétrie en direct (dernière minute)</span>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="flex items-center gap-1 font-mono text-cyan-400">
                        <span className="h-2 w-2 rounded-full bg-cyan-400 inline-block" /> CPU
                      </span>
                      <span className="flex items-center gap-1 font-mono text-purple-400">
                        <span className="h-2 w-2 rounded-full bg-purple-400 inline-block" /> RAM
                      </span>
                    </div>
                  </div>
                  <div className="h-24 w-full bg-hover/10 rounded-lg p-2 border border-border">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={history}>
                        <defs>
                          <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.0} />
                          </linearGradient>
                          <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#c084fc" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#c084fc" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="time" hide />
                        <YAxis domain={[0, 100]} hide />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", fontSize: "11px", borderRadius: "6px" }}
                          formatter={(value: unknown, name: unknown) => [
                            `${Number(value).toFixed(1)}%`,
                            String(name) === "cpu" ? "CPU" : "RAM",
                          ]}
                        />
                        <Area type="monotone" dataKey="cpu" stroke="#22d3ee" fillOpacity={1} fill="url(#cpuGrad)" strokeWidth={1.5} isAnimationActive={false} />
                        <Area type="monotone" dataKey="mem" stroke="#c084fc" fillOpacity={1} fill="url(#memGrad)" strokeWidth={1.5} isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Containers */}
              <div className="flex items-center justify-between pt-1 text-xs border-t border-border">
                <span className="flex items-center gap-1.5 text-secondary">
                  <Box size={13} className="text-accent" /> Conteneurs Docker actifs
                </span>
                <span className="font-mono font-bold text-emerald-400">
                  {telemetry.metrics.containerCount}
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-hover/5 p-3 text-xs text-muted">
              <p>
                L&apos;agent Sovrack en Go n&apos;est pas encore détecté sur ce serveur.
                Installez-le en une ligne pour activer la télémétrie en temps réel et le contournement des pare-feux NAT.
              </p>
            </div>
          )}
        </div>

        {/* Monitoring Stack */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Stack d&apos;observabilité Grafana / Loki
          </p>

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
      </div>
    </Modal>
  );
}
