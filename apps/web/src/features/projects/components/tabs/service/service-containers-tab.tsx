"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { monitoringService, type ContainerInfo } from "@/features/monitoring";
import { containersService, type ContainerRecord } from "@/features/platform";
import { getApiErrorMessage } from "@/shared/lib/api";
import { SectionCard } from "@/shared/layout/section-card";
import { ContainerOpsPanel } from "@/features/deployments";

/**
 * Onglet Conteneurs d'un service : réutilise ContainerOpsPanel (stats +
 * start/stop/restart/remove + logs), scopé au ServiceEnvironment déterminé
 * par le sélecteur d'environnement de la page (C2), au lieu du
 * DeploymentContainerDialog qui n'était accessible que depuis la console
 * globale /deployments — voir VERIFICATION_ORGANISATION_FINALE.md §3.4/6.3.
 */
export function ServiceContainersTab({
  serviceEnvId,
  currentDeploymentId,
}: {
  serviceEnvId: string | null;
  currentDeploymentId: string | null;
}) {
  const [info, setInfo] = useState<ContainerInfo | null>(null);
  const [container, setContainer] = useState<ContainerRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [live, setLive] = useState(false);

  const fetchInfo = useCallback(async () => {
    if (!currentDeploymentId) return;
    setLoading(true);
    setError(null);
    try {
      setInfo(
        await monitoringService.getContainerInfo(currentDeploymentId, 200),
      );
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [currentDeploymentId]);

  const fetchContainer = useCallback(async () => {
    if (!serviceEnvId) return;
    try {
      const list = await containersService.listByServiceEnv(serviceEnvId);
      setContainer(list[0] ?? null);
    } catch {
      setContainer(null);
    }
  }, [serviceEnvId]);

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
    setInfo(null);
    setContainer(null);
    setError(null);
    setConfirmRemove(false);
    void fetchInfo();
    void fetchContainer();
  }, [fetchInfo, fetchContainer]);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void fetchInfo(), 5000);
    return () => clearInterval(t);
  }, [live, fetchInfo]);

  if (!serviceEnvId) {
    return (
      <SectionCard
        title="Containers"
        description="Select an environment above to see its container."
      >
        <p className="text-sm text-muted">
          No environment selected.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Containers"
      description="Runtime stats, actions, and live logs for this environment's container."
      contentClassName="p-0"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${live ? "border-accent/30 bg-accent/10 text-accent" : "border-border text-muted hover:text-primary"}`}
          >
            <Activity size={11} className={live ? "animate-pulse" : ""} />{" "}
            Live
          </button>
          <button
            type="button"
            onClick={() => void fetchInfo()}
            disabled={loading}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted transition hover:text-primary disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      }
    >
      <div className="flex min-h-[320px] flex-col overflow-hidden rounded-b-2xl">
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
    </SectionCard>
  );
}
