"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Cpu,
  Database,
  HardDrive,
  Loader2,
  MemoryStick,
  RefreshCw,
  Server,
} from "lucide-react";
import { healthService } from "@/features/monitoring/api/health.service";

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium ${
        ok
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
          : "border-red-500/20 bg-red-500/10 text-red-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`}
      />
      {ok ? "Opérationnel" : "Anomalie"}
    </span>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-hover/15">
      <div
        className="h-full rounded-full bg-accent"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

export default function StaffSystemsPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["staff-health"],
    queryFn: healthService.get,
    enabled: typeof window !== "undefined",
    refetchInterval: 10_000,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-secondary" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-red-500/20 bg-red-500/10 p-6 text-center">
        <h2 className="text-lg font-semibold text-red-400">API injoignable</h2>
        <p className="mt-2 text-sm text-secondary">
          Impossible de récupérer l&apos;état de la plateforme.
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-hover/15 px-4 py-2 text-sm font-medium text-primary transition hover:bg-hover/20"
        >
          <RefreshCw size={14} /> Réessayer
        </button>
      </div>
    );
  }

  const cpuPct = data.host?.cpuLoad1m
    ? Math.min(100, (data.host.cpuLoad1m / data.host.cpuCount) * 100)
    : 0;
  const diskPct = data.host?.diskUsedPercent ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">Systèmes</h1>
          <p className="text-sm text-secondary">
            État global de la plateforme Sovrack ·{` `}
            {new Date(data.timestamp).toLocaleTimeString("fr-TN")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 rounded-lg bg-hover/15 px-3 py-2 text-sm font-medium text-primary transition hover:bg-hover/20 disabled:opacity-50"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          Actualiser
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-hover/10 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Database size={16} className="text-accent" /> Base de données
            </div>
            <StatusBadge ok={data.database === "connected"} />
          </div>
          <p className="mt-2 text-xs text-secondary">PostgreSQL</p>
        </div>

        <div className="rounded-lg border border-border bg-hover/10 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Server size={16} className="text-accent" /> Redis
            </div>
            <StatusBadge ok={data.redis === "connected"} />
          </div>
          <p className="mt-2 text-xs text-secondary">
            Cache & files d&apos;attente
          </p>
        </div>

        <div className="rounded-lg border border-border bg-hover/10 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Activity size={16} className="text-accent" /> API
            </div>
            <StatusBadge ok={data.status === "ok"} />
          </div>
          <p className="mt-2 text-xs text-secondary">
            UpTime {Math.round(data.uptime / 1000)}s · v{data.version}
          </p>
        </div>
      </div>

      {data.host && (
        <div className="rounded-lg border border-border bg-hover/10 p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-primary">
            <Cpu size={16} className="text-accent" /> Ressources de
            l&apos;hôte
          </h2>
          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <div className="mb-1.5 flex justify-between text-xs text-secondary">
                <span className="flex items-center gap-1">
                  <Cpu size={13} /> CPU
                </span>
                <span>{cpuPct.toFixed(0)}%</span>
              </div>
              <Bar value={cpuPct} />
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-xs text-secondary">
                <span className="flex items-center gap-1">
                  <MemoryStick size={13} /> Mémoire
                </span>
                <span>
                  {(
                    (data.host.memoryTotalMb - data.host.memoryFreeMb) /
                    1024
                  ).toFixed(1)}{" "}
                  / {(data.host.memoryTotalMb / 1024).toFixed(0)} Go
                </span>
              </div>
              <Bar value={memoryUsedPercent(data.host)} />
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-xs text-secondary">
                <span className="flex items-center gap-1">
                  <HardDrive size={13} /> Disque
                </span>
                <span>{diskPct > 0 ? `${diskPct.toFixed(0)}%` : "N/A"}</span>
              </div>
              <Bar value={diskPct} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function memoryUsedPercent(
  host: NonNullable<
    import("@/features/monitoring/api/health.service").PlatformHealth["host"]
  >,
): number {
  if (!host.memoryTotalMb) return 0;
  return ((host.memoryTotalMb - host.memoryFreeMb) / host.memoryTotalMb) * 100;
}
