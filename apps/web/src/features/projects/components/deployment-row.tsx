"use client";

import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  GitCommitHorizontal,
  Globe,
  Loader2,
  Rocket,
  RotateCcw,
  Square,
  Trash2,
} from "lucide-react";
import type { Deployment } from "@/features/deployments/types";
import {
  timeAgo,
  dur,
  resolveDeploymentUrl,
  ENV_BADGE,
  STATUS_COLOR,
  STATUS_DOT,
  STATUS_BORDER,
} from "@/features/deployments/utils";
import { isCapabilityEnabled } from "@/shared/config/product-capabilities";
import { deploymentStatusLabel } from "@/shared/i18n/product-labels";

type DeploymentRowProps = {
  dep: Deployment;
  index: number;
  projectId?: string;
  rollingBackId: string | null;
  cancellingId: string | null;
  deletingId: string | null;
  confirmDeleteId: string | null;
  canMutate: boolean;
  onOpenDetails: (dep: Deployment) => void;
  onRollback: (id: string) => void;
  onRestore: (id: string) => void;
  onCancel: (id: string) => void;
  onRedeploy: (dep: Deployment) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onDelete: (id: string) => void;
};

/**
 * F-5 fix: single deployment row extracted from ProjectDeploymentsTab to keep
 * the parent component focused on layout/filtering only.
 */
export function DeploymentRow({
  dep,
  index,
  projectId,
  rollingBackId,
  cancellingId,
  deletingId,
  confirmDeleteId,
  canMutate,
  onOpenDetails,
  onRollback,
  onRestore,
  onCancel,
  onRedeploy,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
}: DeploymentRowProps) {
  const url = resolveDeploymentUrl(dep);
  const d = dur(
    dep.startedAt,
    dep.finishedAt ?? (dep.status === "RUNNING" ? undefined : dep.startedAt),
  );
  const isLive = dep.status === "RUNNING" || dep.status === "PENDING";
  const canRedeploy = dep.status === "SUCCESS" || dep.status === "FAILED";
  const canRollback =
    isCapabilityEnabled("deploymentStrategiesAndRollback") && canRedeploy;
  const isServing = (dep.containers?.length ?? 0) > 0;
  const isSuperseded = dep.status === "SUCCESS" && !isServing;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 transition hover:bg-[var(--hover)] ${index !== 0 ? "border-t border-[var(--border)]" : ""} border-l-[3px] ${STATUS_BORDER[dep.status] ?? "border-l-zinc-600"}`}
    >
      <div
        className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[dep.status] ?? "bg-zinc-400"} ${isLive ? "animate-pulse" : ""}`}
      />

      {/* Main info */}
      <div
        className="min-w-0 flex-1 cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={() => onOpenDetails(dep)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpenDetails(dep);
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-xs font-semibold ${STATUS_COLOR[dep.status] ?? "text-zinc-400"}`}
          >
            {deploymentStatusLabel(dep.status)}
          </span>
          {!projectId && dep.project && (
            <Link
              href={`/projects/${dep.project.id}`}
              className="text-xs font-semibold text-[var(--text-primary)] hover:underline"
            >
              {dep.project.name}
            </Link>
          )}
          {dep.environment?.name && (
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ENV_BADGE[dep.environment.name] ?? "border-zinc-500/20 bg-zinc-500/10 text-zinc-400"}`}
            >
              {dep.environment.name}
            </span>
          )}
          <span className="font-mono text-xs text-[var(--text-primary)]">
            {dep.branch}
          </span>
          {dep.service && (
            <span className="rounded border border-[var(--border)] bg-[var(--hover)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
              {dep.service.name}
            </span>
          )}
          {dep.externalPipelineId && (
            <span className="flex items-center gap-1 rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-400">
              <GitCommitHorizontal size={9} /> CI #{dep.externalPipelineId}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <Clock size={10} /> {timeAgo(dep.createdAt)}
          </span>
          {d && (
            <span>
              {d}
              {isLive && (
                <span className="ml-0.5 animate-pulse text-blue-400">…</span>
              )}
            </span>
          )}
          <span>{dep.user?.fullName ?? "Déploiement automatique"}</span>
          {dep.environment?.server && (
            <span className="hidden sm:inline">
              {dep.environment.server.name}
            </span>
          )}
        </div>
        {url && isServing && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <Globe size={10} className="shrink-0 text-green-400" />
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="max-w-[220px] truncate font-mono text-[10px] text-green-400 underline hover:text-green-300"
            >
              {url}
            </a>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        {isServing && (
          <span className="hidden sm:flex items-center gap-1 text-[10px] font-semibold text-green-400">
            <CheckCircle2 size={11} /> En service
          </span>
        )}
        {isSuperseded && (
          <span className="hidden sm:flex items-center gap-1 text-[10px] font-semibold text-[var(--text-muted)]">
            Remplacé
          </span>
        )}

        <button
          type="button"
          onClick={() => onOpenDetails(dep)}
          className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
          title="Voir les détails du déploiement"
        >
          Détails <ChevronRight size={11} />
        </button>

        {canMutate && isLive && (
          <button
            type="button"
            onClick={() => onCancel(dep.id)}
            disabled={cancellingId === dep.id}
            className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
            title="Annuler"
          >
            {cancellingId === dep.id ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Square size={11} />
            )}
            <span className="hidden sm:inline">Annuler</span>
          </button>
        )}

        {canMutate && canRollback && isSuperseded && (
          <button
            type="button"
            onClick={() => onRestore(dep.id)}
            disabled={rollingBackId === dep.id}
            className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-400 transition hover:bg-amber-500/20 disabled:opacity-50"
            title="Restaurer cette version"
          >
            {rollingBackId === dep.id ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <RotateCcw size={11} />
            )}
            <span className="hidden sm:inline">Restaurer</span>
          </button>
        )}

        {canMutate && canRollback && dep.status === "FAILED" && (
          <button
            type="button"
            onClick={() => onRollback(dep.id)}
            disabled={rollingBackId === dep.id}
            className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-400 transition hover:bg-amber-500/20 disabled:opacity-50"
            title="Revenir au dernier déploiement réussi"
          >
            {rollingBackId === dep.id ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <RotateCcw size={11} />
            )}
            <span className="hidden sm:inline">Restaurer</span>
          </button>
        )}

        {canMutate && canRedeploy && (
          <button
            type="button"
            onClick={() => onRedeploy(dep)}
            className="flex items-center gap-1 rounded-lg bg-[var(--text-primary)] px-2.5 py-1.5 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90"
            title="Redéployer"
          >
            <Rocket size={11} />
            <span className="hidden sm:inline">Redéployer</span>
          </button>
        )}

        {canMutate &&
          (confirmDeleteId === dep.id ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onDelete(dep.id)}
                disabled={deletingId === dep.id}
                className="flex items-center gap-1 rounded-lg border border-red-500/50 bg-red-500/20 px-2 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/30 disabled:opacity-50"
              >
                {deletingId === dep.id ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Trash2 size={11} />
                )}
                Confirmer
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onConfirmDelete(dep.id)}
              className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:text-red-400"
              title="Supprimer"
            >
              <Trash2 size={11} />
              <span className="hidden sm:inline">Supprimer</span>
            </button>
          ))}
      </div>
    </div>
  );
}
