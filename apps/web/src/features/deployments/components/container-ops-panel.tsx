"use client";

import { useRef, useEffect } from "react";
import { Loader2, Play, RotateCcw, Square, Trash2, XCircle } from "lucide-react";
import type { ContainerInfo } from "@/features/monitoring";
import type { ContainerRecord } from "@/features/platform";
import { CONTAINER_STATUS_COLOR } from "@/features/deployments/utils";

/**
 * Stats + ops toolbar (start/stop/restart/remove) + live logs for ONE
 * container. Extracted from DeploymentContainerDialog (C4) so the same panel
 * can be reused both as a modal (global /deployments console) and embedded in
 * a page tab (service page's Containers tab), which need different chrome
 * around it but identical data/actions — see
 * VERIFICATION_ORGANISATION_FINALE.md §3.4/6.3.
 */
export function ContainerOpsPanel({
  info,
  container,
  loading,
  error,
  acting,
  confirmRemove,
  onConfirmRemove,
  onAction,
}: {
  info: ContainerInfo | null;
  container: ContainerRecord | null;
  loading: boolean;
  error: string | null;
  acting: string | null;
  confirmRemove: boolean;
  onConfirmRemove: (v: boolean) => void;
  onAction: (action: "start" | "stop" | "restart" | "remove") => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [info?.logs]);

  return (
    <>
      {/* Stats */}
      <div className="border-b border-[var(--border)] px-5 py-3">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            <XCircle size={14} /> {error}
          </div>
        )}
        {!error && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Status"
              value={info?.status ?? "—"}
              mono={false}
              color={info ? CONTAINER_STATUS_COLOR[info.status] : undefined}
            />
            <Stat label="CPU" value={info?.stats?.cpuPercent ?? "—"} />
            <Stat
              label="Memory"
              value={info?.stats?.memPercent ?? "—"}
              sub={info?.stats?.memUsage}
            />
            <Stat label="Net I/O" value={info?.stats?.netIO ?? "—"} />
          </div>
        )}
      </div>

      {/* Ops toolbar */}
      {container && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Actions
          </span>
          <OpBtn
            label="Start"
            icon={<Play size={11} />}
            busy={acting === "start"}
            disabled={info?.status === "running"}
            onClick={() => onAction("start")}
            className="text-green-400 border-green-500/30 hover:bg-green-500/10"
          />
          <OpBtn
            label="Stop"
            icon={<Square size={11} />}
            busy={acting === "stop"}
            disabled={info?.status !== "running"}
            onClick={() => onAction("stop")}
            className="text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
          />
          <OpBtn
            label="Restart"
            icon={<RotateCcw size={11} />}
            busy={acting === "restart"}
            onClick={() => onAction("restart")}
            className="text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
          />
          {confirmRemove ? (
            <span className="flex items-center gap-1.5">
              <OpBtn
                label="Confirm"
                icon={<Trash2 size={11} />}
                busy={acting === "remove"}
                onClick={() => onAction("remove")}
                className="text-red-400 border-red-500/50 bg-red-500/10 hover:bg-red-500/20"
              />
              <button
                type="button"
                onClick={() => onConfirmRemove(false)}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Annuler
              </button>
            </span>
          ) : (
            <OpBtn
              label="Remove"
              icon={<Trash2 size={11} />}
              onClick={() => onConfirmRemove(true)}
              className="ml-auto text-red-400 border-red-500/30 hover:bg-red-500/10"
            />
          )}
        </div>
      )}

      {/* Logs */}
      <div className="flex-1 overflow-y-auto bg-zinc-950 p-4 font-mono text-xs leading-relaxed">
        {loading && !info && (
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Loader2 size={12} className="animate-spin" /> SSH connection and
            fetching logs…
          </div>
        )}
        {!loading && info && !info.logs && (
          <span className="text-zinc-600">No container logs.</span>
        )}
        {info?.logs && (
          <pre className="whitespace-pre-wrap break-words text-green-300">
            {info.logs}
          </pre>
        )}
        <div ref={bottomRef} />
      </div>
    </>
  );
}

function OpBtn({
  label,
  icon,
  onClick,
  busy,
  disabled,
  className,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className={`flex items-center gap-1 rounded-lg border bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ""}`}
    >
      {busy ? <Loader2 size={11} className="animate-spin" /> : icon} {label}
    </button>
  );
}

function Stat({
  label,
  value,
  sub,
  mono = true,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-bold ${mono ? "font-mono" : "capitalize"} ${color ?? "text-[var(--text-primary)]"}`}
      >
        {value}
      </p>
      {sub && (
        <p className="font-mono text-[10px] text-[var(--text-muted)]">{sub}</p>
      )}
    </div>
  );
}
