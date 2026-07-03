"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Box, RefreshCw, X } from "lucide-react";
import { monitoringService, type ContainerInfo } from "@/features/monitoring";
import { containersService, type ContainerRecord } from "@/features/platform";
import { getApiErrorMessage } from "@/shared/lib/api";
import { CONTAINER_STATUS_COLOR } from "@/features/deployments/utils";
import { ContainerOpsPanel } from "./container-ops-panel";

type Props = {
  open: boolean;
  deploymentId: string | null;
  onClose: () => void;
};

/**
 * Dialog "Docker container" : statut + stats (CPU/Mém/Net) + logs runtime du
 * conteneur (docker logs sur le serveur cible). Remplace l'ancienne page de
 * détail ; ouvert depuis un bouton dédié dans la liste des déploiements.
 *
 * Modal chrome + deploymentId-scoped data-fetching only — the actual stats/
 * ops/logs UI lives in ContainerOpsPanel (C4: shared with the service page's
 * embedded Containers tab, see service-containers-tab.tsx).
 */
export function DeploymentContainerDialog({
  open,
  deploymentId,
  onClose,
}: Props) {
  const [info, setInfo] = useState<ContainerInfo | null>(null);
  const [container, setContainer] = useState<ContainerRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [live, setLive] = useState(false);

  const fetchInfo = useCallback(async () => {
    if (!deploymentId) return;
    setLoading(true);
    setError(null);
    try {
      setInfo(await monitoringService.getContainerInfo(deploymentId, 200));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [deploymentId]);

  const fetchContainer = useCallback(async () => {
    if (!deploymentId) return;
    try {
      const list = await containersService.listByDeployment(deploymentId);
      setContainer(list[0] ?? null);
    } catch {
      setContainer(null);
    }
  }, [deploymentId]);

  const runAction = async (action: "start" | "stop" | "restart" | "remove") => {
    if (!container) return;
    setActing(action);
    setError(null);
    try {
      await containersService[action](container.id);
      if (action === "remove") {
        setContainer(null);
        setConfirmRemove(false);
      }
      await Promise.all([fetchInfo(), fetchContainer()]);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setActing(null);
    }
  };

  // Load on open, reset on close.
  useEffect(() => {
    if (open && deploymentId) {
      void fetchInfo();
      void fetchContainer();
    } else {
      setInfo(null);
      setContainer(null);
      setError(null);
      setConfirmRemove(false);
      setLive(false);
    }
  }, [open, deploymentId, fetchInfo, fetchContainer]);

  // Live auto-refresh (5s) while enabled.
  useEffect(() => {
    if (!open || !live) return;
    const t = setInterval(() => void fetchInfo(), 5000);
    return () => clearInterval(t);
  }, [open, live, fetchInfo]);

  // Close on Escape (parity with the shared <Modal>).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !deploymentId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative z-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl"
        style={{ maxHeight: "95vh" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--hover)]">
            <Box size={15} className="text-[var(--text-secondary)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Docker container
              </p>
              {info && (
                <span
                  className={`text-xs font-semibold capitalize ${CONTAINER_STATUS_COLOR[info.status] ?? "text-zinc-400"}`}
                >
                  {info.status}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Runtime stats &amp; logs of the container on the target server.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLive((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${live ? "border-blue-500/30 bg-blue-500/10 text-blue-300" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
            >
              <Activity size={11} className={live ? "animate-pulse" : ""} />{" "}
              Live
            </button>
            <button
              type="button"
              onClick={() => void fetchInfo()}
              disabled={loading}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition hover:text-[var(--text-primary)] disabled:opacity-40"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <ContainerOpsPanel
          info={info}
          container={container}
          loading={loading}
          error={error}
          acting={acting}
          confirmRemove={confirmRemove}
          onConfirmRemove={setConfirmRemove}
          onAction={(action) => void runAction(action)}
        />

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-[var(--border)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
