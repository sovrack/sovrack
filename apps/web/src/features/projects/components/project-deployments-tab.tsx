"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Loader2,
  RefreshCw,
  Rocket,
  XCircle,
} from "lucide-react";
import type {
  Deployment,
  DeploymentStatus,
} from "@/features/deployments/types";
import { deploymentsService } from "@/features/deployments";
import { getApiErrorMessage } from "@/shared/lib/api";
import { DeployDialog } from "@/features/deployments";
import { useToast } from "@/shared/contexts/toast-context";
import { DeploymentRow } from "./deployment-row";

type Props = {
  deployments: Deployment[];
  loading: boolean;
  error: string | null;
  // Absent = mode GLOBAL (multi-projets) : on affiche le nom du projet par ligne
  // et on masque le lien « view all » + le redeploy ciblé sur un seul projet.
  projectId?: string;
  onCreateClick?: () => void;
  onRefresh?: () => void;
  // Masque les pastilles de statut internes quand la page parente gère déjà le
  // filtrage (ex. la console /deployments avec sa propre barre de filtres).
  showStatusFilter?: boolean;
  // Total réel affiché dans l'en-tête quand la page passe une page paginée
  // (sinon = deployments.length, qui ne serait que la page courante).
  headerCount?: number;
  // Masque le lien « View all » vers la console globale /deployments. Utilisé
  // dans l'onglet Deployments d'un service pour garder les deux vues
  // indépendantes (pas de navigation vers la page deployments générale).
  hideViewAllLink?: boolean;
  // Si fourni, le clic sur une ligne / « Details » ouvre les logs via ce handler
  // (popup) au lieu de naviguer vers /deployments/[id]. Permet de rester 100 %
  // dans le contexte du service.
  onOpenDetails?: (dep: Deployment) => void;
};

const STATUS_FILTERS: { label: string; value: DeploymentStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Running", value: "RUNNING" },
  { label: "Success", value: "SUCCESS" },
  { label: "Failed", value: "FAILED" },
  { label: "Pending", value: "PENDING" },
];

export function ProjectDeploymentsTab({
  deployments,
  loading,
  error,
  projectId,
  onRefresh,
  showStatusFilter = true,
  headerCount,
  hideViewAllLink = false,
  onOpenDetails,
}: Props) {
  const router = useRouter();
  const toast = useToast();

  const openDetails = (dep: Deployment) =>
    onOpenDetails ? onOpenDetails(dep) : router.push(`/deployments/${dep.id}`);

  const [statusFilter, setStatusFilter] = useState<DeploymentStatus | "ALL">(
    "ALL",
  );
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [redeployTarget, setRedeployTarget] = useState<{
    branch: string;
    environmentId: string;
    projectId: string;
  } | null>(null);

  const handleRollback = async (depId: string) => {
    setRollingBackId(depId);
    try {
      await deploymentsService.rollback(depId);
      onRefresh?.();
    } catch (err) {
      toast(getApiErrorMessage(err), "error");
    } finally {
      setRollingBackId(null);
    }
  };

  const handleRestore = async (depId: string) => {
    setRollingBackId(depId);
    try {
      await deploymentsService.rollback(depId, depId);
      onRefresh?.();
    } catch (err) {
      toast(getApiErrorMessage(err), "error");
    } finally {
      setRollingBackId(null);
    }
  };

  const handleCancel = async (depId: string) => {
    setCancellingId(depId);
    try {
      await deploymentsService.cancel(depId);
      onRefresh?.();
    } catch (err) {
      toast(getApiErrorMessage(err), "error");
    } finally {
      setCancellingId(null);
    }
  };

  const handleDelete = async (depId: string) => {
    setDeletingId(depId);
    setConfirmDeleteId(null);
    try {
      await deploymentsService.delete(depId);
      onRefresh?.();
    } catch (err) {
      toast(getApiErrorMessage(err), "error");
    } finally {
      setDeletingId(null);
    }
  };

  const filtered =
    statusFilter === "ALL"
      ? deployments
      : deployments.filter((d) => d.status === statusFilter);
  // En mode global on en montre davantage (pas de pagination dédiée ici).
  const visible = filtered.slice(0, projectId ? 20 : 100);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Deployments
          </p>
          <span className="rounded-full border border-[var(--border)] bg-[var(--hover)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
            {headerCount ?? deployments.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--hover)] text-[var(--text-muted)] transition hover:text-[var(--text-primary)] disabled:opacity-40"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            </button>
          )}
        </div>
      </div>

      {/* Status filter pills (masquées quand la page parente filtre déjà) */}
      {showStatusFilter && (
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((opt) => {
            const count =
              opt.value === "ALL"
                ? deployments.length
                : deployments.filter((d) => d.status === opt.value).length;
            const active = statusFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${active ? "border-[var(--text-primary)]/30 bg-[var(--text-primary)]/10 text-[var(--text-primary)]" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
              >
                {opt.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${active ? "bg-[var(--text-primary)]/20" : "bg-[var(--hover)]"}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <XCircle size={14} className="shrink-0" /> {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-8 text-sm text-[var(--text-secondary)]">
          <Loader2 size={14} className="animate-spin" /> Loading history…
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-14 text-center">
          <Rocket size={28} className="mb-3 text-[var(--text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {statusFilter === "ALL"
              ? "No deployments yet"
              : `No ${statusFilter.toLowerCase()} deployments`}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {statusFilter === "ALL"
              ? "Deploy your project to see history here."
              : "Try a different filter."}
          </p>
        </div>
      )}

      {/* Run list */}
      {!loading && visible.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
          {visible.map((dep, i) => (
            <DeploymentRow
              key={dep.id}
              dep={dep}
              index={i}
              projectId={projectId}
              rollingBackId={rollingBackId}
              cancellingId={cancellingId}
              deletingId={deletingId}
              confirmDeleteId={confirmDeleteId}
              onOpenDetails={openDetails}
              onRollback={(id) => void handleRollback(id)}
              onRestore={(id) => void handleRestore(id)}
              onCancel={(id) => void handleCancel(id)}
              onRedeploy={(dep) =>
                setRedeployTarget({
                  branch: dep.branch,
                  environmentId: dep.environment?.id ?? "",
                  projectId: dep.project?.id ?? projectId ?? "",
                })
              }
              onConfirmDelete={setConfirmDeleteId}
              onCancelDelete={() => setConfirmDeleteId(null)}
              onDelete={(id) => void handleDelete(id)}
            />
          ))}
        </div>
      )}

      {!hideViewAllLink && projectId && filtered.length > 20 && (
        <Link
          href={`/deployments?project=${projectId}`}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--border)] py-3 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        >
          <ExternalLink size={11} /> View all {filtered.length} deployments →
        </Link>
      )}

      {/* Redeploy dialog — branch + env pre-filled from original run */}
      {(redeployTarget?.projectId ?? projectId) && (
        <DeployDialog
          open={redeployTarget !== null}
          projectId={redeployTarget?.projectId ?? projectId ?? ""}
          initialEnvironmentId={redeployTarget?.environmentId}
          initialBranch={redeployTarget?.branch}
          onClose={() => setRedeployTarget(null)}
          onCreated={() => {
            setRedeployTarget(null);
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
}
