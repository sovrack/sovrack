"use client";

import { Server } from "lucide-react";
import { useI18n } from "@/shared/i18n/language-context";
import Link from "next/link";

type Props = {
  servers: {
    total: number;
    ready: number;
    preparing: number;
    error: number;
    offline: number;
  };
  isAdmin: boolean;
};

export function ServerHealthCard({ servers, isAdmin }: Props) {
  const { t } = useI18n();
  if (!isAdmin || servers.total === 0) {
    return null;
  }

  const items = [
    { label: t("Ready"), value: servers.ready, color: "bg-emerald-400" },
    { label: t("Provisioning"), value: servers.preparing, color: "bg-blue-400" },
    { label: t("Errors"), value: servers.error, color: "bg-red-400" },
    { label: t("Offline"), value: servers.offline, color: "bg-zinc-500" },
  ];

  const healthPct =
    servers.total > 0 ? Math.round((servers.ready / servers.total) * 100) : 0;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Server size={14} />
          Servers ({servers.total})
        </p>
        {isAdmin && (
          <Link
            href="/admin/servers"
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
          >
            {t("view all →")}
          </Link>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="h-full rounded-full bg-emerald-400 transition-all"
          style={{ width: `${healthPct}%` }}
        />
      </div>

      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex items-center justify-between text-sm"
          >
            <span className="flex items-center gap-2 text-[var(--text-secondary)]">
              <span className={`h-2 w-2 rounded-full ${item.color}`} />
              {item.label}
            </span>
            <span className="font-semibold text-[var(--text-primary)]">
              {item.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
