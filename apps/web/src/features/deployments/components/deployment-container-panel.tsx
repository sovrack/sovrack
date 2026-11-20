"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { monitoringService, type ContainerInfo } from "@/features/monitoring";
import { containersService, type ContainerRecord } from "@/features/platform";
import { getApiErrorMessage } from "@/shared/lib/api";
import { ContainerOpsPanel } from "./container-ops-panel";

/**
 * Conteneur d'un déploiement EN INLINE (P2.4, mission finale) — même contenu
 * que DeploymentContainerDialog (stats + start/stop/restart/remove via
 * ContainerOpsPanel) mais rendu comme un onglet de la page de détail plutôt
 * qu'en modale. La logique de fetch est identique ; `active` déclenche le
 * chargement quand l'onglet est visible.
 */
export function DeploymentContainerPanel({
  deploymentId,
  active,
}: {
  deploymentId: string;
  active: boolean;
}) {
  const [info, setInfo] = useState<ContainerInfo | null>(null);
  const [container, setContainer] = useState<ContainerRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [live, setLive] = useState(false);

  const fetchInfo = useCallback(async () => {
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

  useEffect(() => {
    if (active) {
      void fetchInfo();
      void fetchContainer();
    }
  }, [active, fetchInfo, fetchContainer]);

  useEffect(() => {
    if (!active || !live) return;
    const t = setInterval(() => void fetchInfo(), 5000);
    return () => clearInterval(t);
  }, [active, live, fetchInfo]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-end gap-2 border-b border-border px-4 py-2.5">
        <button
          type="button"
          onClick={() => setLive((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${live ? "border-accent/30 bg-accent/10 text-accent" : "border-border text-muted hover:text-primary"}`}
        >
          <Activity size={11} className={live ? "animate-pulse" : ""} /> Live
        </button>
        <button
          type="button"
          onClick={() => void fetchInfo()}
          disabled={loading}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted transition hover:text-primary disabled:opacity-40"
          aria-label="Refresh container stats"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
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
    </div>
  );
}
