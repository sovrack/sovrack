"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Box,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitCommitHorizontal,
  Globe,
  Loader2,
  RotateCcw,
  Rocket,
  Server,
  Square,
  Terminal,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import { deploymentsService } from "@/features/deployments/api/deployments.service";
import { getApiErrorMessage } from "@/shared/lib/api";
import { DeploymentStatusBadge } from "@/features/deployments/components/deployment-status-badge";
import { DeploymentLogsDialog } from "@/features/projects/components/tabs/runs/deployment-logs-dialog";
import { DeploymentContainerDialog } from "@/features/deployments/components/deployment-container-dialog";
import { DeployDialog } from "@/features/projects";
import {
  resolveDeploymentUrl,
  timeAgo,
  dur,
} from "@/features/deployments/utils";

/**
 * Page de détail d'un déploiement : TOUT ce qui le concerne sur une seule page —
 * métadonnées, URL publique, image Docker, spec figée (Immutable Release), logs
 * build/deploy, conteneur live, et actions (rollback / redeploy / cancel / delete).
 * Accessible en cliquant une ligne dans la liste des déploiements.
 */
export default function DeploymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();

  const {
    data: dep,
    isLoading,
    error: qErr,
    refetch,
  } = useQuery({
    queryKey: ["deployment", id],
    queryFn: () => deploymentsService.getById(id),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "RUNNING" || s === "PENDING" ? 4000 : false;
    },
  });

  const [logsOpen, setLogsOpen] = useState(false);
  const [containerOpen, setContainerOpen] = useState(false);
  const [redeployOpen, setRedeployOpen] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [actError, setActError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["deployment", id] });
    await refetch();
  };

  const run = async (
    label: string,
    fn: () => Promise<unknown>,
    after?: () => void,
  ) => {
    setActing(label);
    setActError(null);
    try {
      await fn();
      after?.();
    } catch (e) {
      setActError(getApiErrorMessage(e));
    } finally {
      setActing(null);
    }
  };

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2
          size={24}
          className="animate-spin text-[var(--text-secondary)]"
        />
      </div>
    );
  if (qErr || !dep)
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-300">
        {qErr ? getApiErrorMessage(qErr) : "Deployment not found."}
        <div className="mt-3">
          <Link href="/deployments" className="text-xs underline">
            ← Deployments
          </Link>
        </div>
      </div>
    );

  const url = resolveDeploymentUrl(dep);
  const isLive = dep.status === "RUNNING" || dep.status === "PENDING";
  const canRollback = dep.status === "SUCCESS" || dep.status === "FAILED";
  const duration = dur(
    dep.startedAt,
    dep.finishedAt ?? (dep.status === "RUNNING" ? undefined : dep.startedAt),
  );
  const spec = (dep.specSnapshot ?? {}) as Record<string, unknown>;

  const meta: { label: string; value: React.ReactNode }[] = [
    {
      label: "Project",
      value: dep.project ? (
        <Link
          href={`/projects/${dep.project.id}`}
          className="text-[var(--text-primary)] hover:underline"
        >
          {dep.project.name}
        </Link>
      ) : (
        "—"
      ),
    },
    { label: "Environment", value: dep.environment?.name ?? "—" },
    { label: "Service", value: dep.service?.name ?? "—" },
    { label: "Branch", value: <span className="font-mono">{dep.branch}</span> },
    {
      label: "Server",
      value: dep.environment?.server ? (
        <span className="inline-flex items-center gap-1">
          <Server size={12} /> {dep.environment.server.name}{" "}
          <span className="text-[var(--text-muted)]">
            ({dep.environment.server.host})
          </span>
        </span>
      ) : (
        "—"
      ),
    },
    {
      label: "Trigger",
      value: (
        <span className="inline-flex items-center gap-1">
          <User size={12} /> {dep.user?.fullName ?? "Auto-deploy"}
        </span>
      ),
    },
    {
      label: "Created",
      value: `${timeAgo(dep.createdAt)} · ${new Date(dep.createdAt).toLocaleString()}`,
    },
    { label: "Duration", value: duration || "—" },
    { label: "Strategy", value: (spec.strategy as string) ?? "STANDARD" },
    {
      label: "Pipeline CI",
      value: dep.externalPipelineId ? (
        <span className="inline-flex items-center gap-1 font-mono text-blue-400">
          <GitCommitHorizontal size={12} /> #{dep.externalPipelineId}
        </span>
      ) : (
        "—"
      ),
    },
    {
      label: "Image Docker",
      value: dep.dockerImage ? (
        <span className="break-all font-mono text-xs">{dep.dockerImage}</span>
      ) : (
        "—"
      ),
    },
    {
      label: "Image SHA",
      value: dep.imageSha ? (
        <span className="break-all font-mono text-xs">{dep.imageSha}</span>
      ) : (
        "—"
      ),
    },
  ];

  const specRows = Object.entries(spec).filter(
    ([, v]) => v !== null && v !== undefined && typeof v !== "object",
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Link
            href="/deployments"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={15} /> Deployments
          </Link>
          <div className="flex items-center gap-3">
            <DeploymentStatusBadge status={dep.status} />
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">
              {dep.service?.name ?? "Déploiement"}
            </h1>
          </div>
          <p className="font-mono text-xs text-[var(--text-muted)]">{dep.id}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setLogsOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
          >
            <Terminal size={12} /> Logs
          </button>
          {dep.status === "SUCCESS" && (
            <button
              type="button"
              onClick={() => setContainerOpen(true)}
              className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
            >
              <Box size={12} /> Conteneur
            </button>
          )}
          {isLive && (
            <button
              type="button"
              onClick={() =>
                void run(
                  "cancel",
                  () => deploymentsService.cancel(dep.id),
                  () => void refresh(),
                )
              }
              disabled={acting === "cancel"}
              className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              {acting === "cancel" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Square size={12} />
              )}{" "}
              Cancel
            </button>
          )}
          {canRollback && (
            <button
              type="button"
              onClick={() =>
                void run(
                  "rollback",
                  () => deploymentsService.rollback(dep.id),
                  () => void refresh(),
                )
              }
              disabled={acting === "rollback"}
              className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-400 transition hover:bg-amber-500/20 disabled:opacity-50"
            >
              {acting === "rollback" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RotateCcw size={12} />
              )}{" "}
              Rollback
            </button>
          )}
          {canRollback && (
            <button
              type="button"
              onClick={() => setRedeployOpen(true)}
              className="flex items-center gap-1 rounded-lg bg-[var(--text-primary)] px-2.5 py-1.5 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90"
            >
              <Rocket size={12} /> Redeploy
            </button>
          )}
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  void run(
                    "delete",
                    () => deploymentsService.delete(dep.id),
                    () => router.push("/deployments"),
                  )
                }
                disabled={acting === "delete"}
                className="flex items-center gap-1 rounded-lg border border-red-500/50 bg-red-500/20 px-2 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/30 disabled:opacity-50"
              >
                {acting === "delete" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Trash2 size={12} />
                )}{" "}
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:text-red-400"
            >
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      </div>

      {actError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <XCircle size={14} /> {actError}
        </div>
      )}

      {/* URL publique */}
      {url && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          {dep.status === "SUCCESS" ? (
            <CheckCircle2 size={16} className="text-green-400" />
          ) : (
            <Globe size={16} className="text-[var(--text-muted)]" />
          )}
          <span className="text-sm text-[var(--text-secondary)]">
            URL de l’application
          </span>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 break-all font-mono text-sm text-green-400 underline hover:text-green-300"
          >
            {url} <ExternalLink size={12} />
          </a>
        </div>
      )}

      {/* Métadonnées */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
          Details
        </p>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {meta.map((m) => (
            <div key={m.label}>
              <dt className="text-xs text-[var(--text-muted)]">{m.label}</dt>
              <dd className="mt-0.5 text-sm text-[var(--text-primary)]">
                {m.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Spec figée (Immutable Release) */}
      {specRows.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
            <Clock size={13} /> Frozen configuration (Immutable Release)
          </p>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {specRows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-[var(--text-muted)]">{k}</dt>
                <dd className="mt-0.5 break-all font-mono text-xs text-[var(--text-primary)]">
                  {String(v)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Logs stockés (aperçu) */}
      {dep.logs && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
              <Terminal size={13} /> Journal
            </p>
            <button
              type="button"
              onClick={() => setLogsOpen(true)}
              className="text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
            >
              Logs live →
            </button>
          </div>
          <pre className="max-h-72 overflow-auto rounded-xl bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap">
            {dep.logs}
          </pre>
        </div>
      )}

      {/* Dialogs */}
      <DeploymentLogsDialog
        open={logsOpen}
        deploymentId={logsOpen ? dep.id : null}
        initialStatus={dep.status}
        onClose={() => setLogsOpen(false)}
      />
      <DeploymentContainerDialog
        open={containerOpen}
        deploymentId={containerOpen ? dep.id : null}
        onClose={() => setContainerOpen(false)}
      />
      {dep.project?.id && (
        <DeployDialog
          open={redeployOpen}
          projectId={dep.project.id}
          initialEnvironmentId={dep.environment?.id}
          initialBranch={dep.branch}
          onClose={() => setRedeployOpen(false)}
          onCreated={() => {
            setRedeployOpen(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
