"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2 } from "lucide-react";
import { monitoringService } from "@/features/monitoring";
import { SectionCard } from "@/shared/layout/section-card";
import type { Deployment } from "@/features/deployments/types";

/**
 * Historique CPU/mémoire d'un service (Prometheus) avec MARQUEURS DE DÉPLOIEMENT :
 * une ligne verticale par déploiement → on voit « le pic a suivi tel deploy ».
 * Dégradation gracieuse : si Prometheus n'est pas installé, message d'invite.
 */
export function ServiceMetricsChart({
  serviceEnvId,
  deployments,
}: {
  serviceEnvId: string | null;
  deployments: Deployment[];
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["service-metric-range", serviceEnvId],
    queryFn: () =>
      monitoringService.getServiceMetricRange(serviceEnvId!, 60, 60),
    enabled: Boolean(serviceEnvId),
    refetchInterval: 30_000,
  });

  if (!serviceEnvId) return null;

  const points = (data?.series.cpuPercent ?? []).map((p, i) => ({
    t: p.t,
    cpu: p.value,
    mem: data?.series.memoryMb[i]?.value ?? null,
  }));

  // Marqueurs : déploiements dont le démarrage tombe dans la fenêtre affichée.
  const markers =
    data && points.length > 0
      ? deployments
          .filter((d) => d.startedAt)
          .map((d) => ({
            t: Math.floor(new Date(d.startedAt as string).getTime() / 1000),
            id: d.id,
          }))
          .filter((m) => m.t >= data.from && m.t <= data.to)
      : [];

  const fmtTime = (t: number) =>
    new Date(t * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <SectionCard
      title="History (1 h)"
      description="Container CPU & memory over time. Vertical lines = deployments."
    >
      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-[var(--text-secondary)]">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      ) : !data?.configured ? (
        <p className="py-8 text-center text-sm text-[var(--text-muted)]">
          Historical charts are not enabled in the V1. Live metrics remain
          available above.
        </p>
      ) : points.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--text-muted)]">
          No metric points for this service yet.
        </p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 8, right: 8, bottom: 4, left: -8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="t"
                tickFormatter={fmtTime}
                stroke="var(--text-muted)"
                fontSize={11}
              />
              <YAxis
                yAxisId="cpu"
                stroke="var(--text-muted)"
                fontSize={11}
                width={38}
              />
              <YAxis
                yAxisId="mem"
                orientation="right"
                stroke="var(--text-muted)"
                fontSize={11}
                width={44}
              />
              <Tooltip
                labelFormatter={(t) => fmtTime(Number(t))}
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: unknown, name: unknown) => [
                  name === "cpu"
                    ? `${Number(value).toFixed(1)} %`
                    : `${Number(value).toFixed(0)} MB`,
                  name === "cpu" ? "CPU" : "Memory",
                ]}
              />
              <Line
                yAxisId="cpu"
                type="monotone"
                dataKey="cpu"
                stroke="#22c55e"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Line
                yAxisId="mem"
                type="monotone"
                dataKey="mem"
                stroke="#3b82f6"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
              {markers.map((m) => (
                <ReferenceLine
                  key={m.id}
                  yAxisId="cpu"
                  x={m.t}
                  stroke="var(--text-muted)"
                  strokeDasharray="2 2"
                  label={{
                    value: "⬩",
                    fill: "var(--text-muted)",
                    fontSize: 10,
                  }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 flex items-center gap-4 text-xs text-[var(--text-muted)]">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500" /> CPU %
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> Memory (MB)
            </span>
            <span className="flex items-center gap-1">
              <span className="text-[var(--text-muted)]">⋮</span> deployment
            </span>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
