"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Globe,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/shared/layout/page-header";
import { SectionCard } from "@/shared/layout/section-card";
import { healthService } from "@/features/monitoring/api/health.service";
import { getApiErrorMessage } from "@/shared/lib/api";

type Tone = "ok" | "warn" | "down";

function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  const styles: Record<Tone, string> = {
    ok: "bg-green-500/10 text-green-400 border-green-500/20",
    warn: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    down: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  const Icon =
    tone === "ok" ? CheckCircle2 : tone === "warn" ? AlertTriangle : XCircle;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[tone]}`}
    >
      <Icon size={12} />
      {label}
    </span>
  );
}

function ComponentRow({
  icon,
  name,
  detail,
  tone,
  label,
}: {
  icon: React.ReactNode;
  name: string;
  detail?: string;
  tone: Tone;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="text-[var(--text-secondary)]">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {name}
          </p>
          {detail && (
            <p className="truncate text-xs text-[var(--text-muted)]">
              {detail}
            </p>
          )}
        </div>
      </div>
      <StatusPill tone={tone} label={label} />
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// C1: this page reports the health of the PRODUCT itself (backend API,
// database, deployment queue, webhook config) — it deliberately does not
// cover per-VPS observability (Prometheus/Grafana/monitored servers), which
// is a client-server concern, not a platform-health one. That install flow
// already lives at /automation (action "install_prometheus_grafana",
// reachable from the main navigation) — nothing was lost by removing the
// redundant shortcut that used to sit here.
export default function SystemStatusPage() {
  const health = useQuery({
    queryKey: ["platform-health"],
    queryFn: () => healthService.get(),
    refetchInterval: 10_000,
  });

  const h = health.data;

  // The API is reachable iff the /health request itself succeeds.
  const apiTone: Tone = health.isError ? "down" : health.data ? "ok" : "warn";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="System Status"
        description="Live health of the platform's core components (auto-refreshes)."
      />

      <SectionCard
        title="Core services"
        description="Backend API, database, and the deployment queue (Redis/BullMQ)."
      >
        {health.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" /> Checking…
          </div>
        ) : (
          <div className="flex flex-col">
            <ComponentRow
              icon={<Activity size={16} />}
              name="Backend API"
              detail={
                h
                  ? `v${h.version} · uptime ${formatUptime(h.uptime)}`
                  : undefined
              }
              tone={apiTone}
              label={apiTone === "ok" ? "Operational" : "Unreachable"}
            />
            <ComponentRow
              icon={<Database size={16} />}
              name="Database (PostgreSQL)"
              tone={h?.database === "connected" ? "ok" : "down"}
              label={h?.database === "connected" ? "Connected" : "Disconnected"}
            />
            <ComponentRow
              icon={<RefreshCw size={16} />}
              name="Deployment queue (Redis)"
              detail="Required by BullMQ to process deployments"
              tone={h?.redis === "connected" ? "ok" : "down"}
              label={h?.redis === "connected" ? "Connected" : "Disconnected"}
            />
            <ComponentRow
              icon={<Globe size={16} />}
              name="Webhook configuration"
              detail={
                h?.webhook.callbackUrl ?? "WEBHOOK_BASE_URL not configured"
              }
              tone={
                !h?.webhook.autoConfigure
                  ? "ok"
                  : h?.webhook.valid && h?.webhook.configured
                    ? "ok"
                    : "warn"
              }
              label={
                !h?.webhook.autoConfigure
                  ? "Manual"
                  : h?.webhook.valid && h?.webhook.configured
                    ? "Configured"
                    : "Incomplete"
              }
            />
          </div>
        )}
        {health.isError && (
          <p className="mt-3 text-xs text-red-400">
            {getApiErrorMessage(health.error)}
          </p>
        )}
      </SectionCard>
    </div>
  );
}
