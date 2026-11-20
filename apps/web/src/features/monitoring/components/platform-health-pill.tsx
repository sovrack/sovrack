"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Server, XCircle } from "lucide-react";
import Link from "next/link";
import { healthService } from "@/features/monitoring/api/health.service";

type Tone = "ok" | "warn" | "down";

const pillStyles: Record<Tone, string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  down: "border-red-500/30 bg-red-500/10 text-red-300",
};

export function PlatformHealthPill() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ["platform-health-dashboard-pill"],
    queryFn: healthService.get,
    refetchInterval: 15_000,
  });

  let tone: Tone;
  if (isError || !data) {
    tone = "down";
  } else if (
    data.database === "disconnected" ||
    data.redis === "disconnected"
  ) {
    tone = "down";
  } else if (data.webhook.autoConfigure && (!data.webhook.valid || !data.webhook.configured)) {
    tone = "warn";
  } else {
    tone = "ok";
  }

  const Icon = isLoading ? Loader2 : tone === "ok" ? CheckCircle2 : tone === "warn" ? AlertTriangle : XCircle;
  const label = isLoading
    ? "Vérification…"
    : tone === "ok"
      ? "Plateforme opérationnelle"
      : tone === "warn"
        ? "Configuration incomplète"
        : "Plateforme en anomalie";

  return (
    <Link
      href="/staff/systems"
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition hover:opacity-85 ${pillStyles[tone]}`}
      title="État de la plateforme — voir le détail dans le back-office"
    >
      <span className="flex h-4 w-4 items-center justify-center">
        {isLoading ? <Loader2 className="animate-spin" size={13} /> : <Icon size={13} />}
      </span>
      <Server size={11} className="opacity-70" />
      {label}
    </Link>
  );
}
