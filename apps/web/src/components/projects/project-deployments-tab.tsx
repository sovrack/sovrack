'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  GitCommitHorizontal,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  RotateCcw,
  Square,
  Terminal,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { Deployment, DeploymentStatus } from '@/types/deployment';
import { deploymentsService } from '@/services/deployments.service';
import { getApiErrorMessage } from '@/lib/api';
import { DeploymentCreateDialog } from '@/components/deployments/deployment-create-dialog';
import { DeploymentLogsDialog } from '@/components/projects/tabs/runs/deployment-logs-dialog';
import { timeAgo, dur, resolveDeploymentUrl, ENV_BADGE, STATUS_DOT, STATUS_BORDER } from '@/lib/deployment-utils';

type Props = {
  deployments: Deployment[];
  loading: boolean;
  error: string | null;
  projectId: string;
  onCreateClick?: () => void;
  onRefresh?: () => void;
};

const STATUS_FILTERS: { label: string; value: DeploymentStatus | 'ALL' }[] = [
  { label: 'All',     value: 'ALL' },
  { label: 'Running', value: 'RUNNING' },
  { label: 'Success', value: 'SUCCESS' },
  { label: 'Failed',  value: 'FAILED' },
  { label: 'Pending', value: 'PENDING' },
];

const STATUS_LABEL: Record<DeploymentStatus, string> = {
  RUNNING: 'Running', SUCCESS: 'Success', FAILED: 'Failed',
  PENDING: 'Pending', CANCELED: 'Canceled',
};

const STATUS_COLOR: Record<DeploymentStatus, string> = {
  RUNNING: 'text-blue-400', SUCCESS: 'text-green-400', FAILED: 'text-red-400',
  PENDING: 'text-amber-400', CANCELED: 'text-zinc-400',
};

export function ProjectDeploymentsTab({ deployments, loading, error, projectId, onCreateClick, onRefresh }: Props) {
  const [statusFilter, setStatusFilter] = useState<DeploymentStatus | 'ALL'>('ALL');
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [logsTarget, setLogsTarget] = useState<{ id: string; status: DeploymentStatus } | null>(null);
  const [redeployTarget, setRedeployTarget] = useState<{ branch: string; environmentId: string } | null>(null);

  const handleRollback = async (depId: string) => {
    setRollingBackId(depId); setRollbackError(null);
    try {
      await deploymentsService.rollback(depId);
      onRefresh?.();
    } catch (err) { setRollbackError(getApiErrorMessage(err)); }
    finally { setRollingBackId(null); }
  };

  const handleCancel = async (depId: string) => {
    setCancellingId(depId);
    try {
      await deploymentsService.cancel(depId);
      onRefresh?.();
    } catch { /* ignore */ }
    finally { setCancellingId(null); }
  };

  const handleDelete = async (depId: string) => {
    setDeletingId(depId);
    setConfirmDeleteId(null);
    try {
      await deploymentsService.delete(depId);
      onRefresh?.();
    } catch { /* ignore */ }
    finally { setDeletingId(null); }
  };

  const filtered = statusFilter === 'ALL' ? deployments : deployments.filter((d) => d.status === statusFilter);
  const visible = filtered.slice(0, 20);

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Deployments</p>
          <span className="rounded-full border border-[var(--border)] bg-[var(--hover)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
            {deployments.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button type="button" onClick={onRefresh} disabled={loading}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--hover)] text-[var(--text-muted)] transition hover:text-[var(--text-primary)] disabled:opacity-40">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((opt) => {
          const count = opt.value === 'ALL' ? deployments.length : deployments.filter((d) => d.status === opt.value).length;
          const active = statusFilter === opt.value;
          return (
            <button key={opt.value} type="button" onClick={() => setStatusFilter(opt.value)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${active ? 'border-[var(--text-primary)]/30 bg-[var(--text-primary)]/10 text-[var(--text-primary)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
              {opt.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${active ? 'bg-[var(--text-primary)]/20' : 'bg-[var(--hover)]'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Error */}
      {(error ?? rollbackError) && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <XCircle size={14} className="shrink-0" /> {error ?? rollbackError}
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
            {statusFilter === 'ALL' ? 'No deployments yet' : `No ${statusFilter.toLowerCase()} deployments`}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {statusFilter === 'ALL' ? 'Deploy your project to see history here.' : 'Try a different filter.'}
          </p>
        </div>
      )}

      {/* Run list */}
      {!loading && visible.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
          {visible.map((dep, i) => {
            const url = resolveDeploymentUrl(dep);
            const d = dur(dep.startedAt, dep.finishedAt ?? (dep.status === 'RUNNING' ? undefined : dep.startedAt));
            const isLive = dep.status === 'RUNNING' || dep.status === 'PENDING';
            const canRollback = dep.status === 'SUCCESS' || dep.status === 'FAILED';
            const envId = dep.environment?.id ?? '';

            return (
              <div key={dep.id}
                className={`flex items-center gap-3 px-4 py-3.5 transition hover:bg-[var(--hover)] ${i !== 0 ? 'border-t border-[var(--border)]' : ''} border-l-[3px] ${STATUS_BORDER[dep.status] ?? 'border-l-zinc-600'}`}>

                <div className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[dep.status] ?? 'bg-zinc-400'} ${isLive ? 'animate-pulse' : ''}`} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-semibold ${STATUS_COLOR[dep.status] ?? 'text-zinc-400'}`}>
                      {STATUS_LABEL[dep.status]}
                    </span>
                    {dep.environment?.name && (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ENV_BADGE[dep.environment.name] ?? 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400'}`}>
                        {dep.environment.name}
                      </span>
                    )}
                    <span className="font-mono text-xs text-[var(--text-primary)]">{dep.branch}</span>
                    {dep.service && (
                      <span className="rounded border border-[var(--border)] bg-[var(--hover)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{dep.service.name}</span>
                    )}
                    {dep.externalPipelineId && (
                      <span
                        className="flex items-center gap-1 rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-400">
                        <GitCommitHorizontal size={9} /> CI #{dep.externalPipelineId}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                    <span className="flex items-center gap-1"><Clock size={10} /> {timeAgo(dep.createdAt)}</span>
                    {d && <span>{d}{isLive && <span className="ml-0.5 animate-pulse text-blue-400">…</span>}</span>}
                    <span>{dep.user.fullName}</span>
                    {dep.environment?.server && <span className="hidden sm:inline">{dep.environment.server.name}</span>}
                  </div>
                  {url && dep.status === 'SUCCESS' && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <Globe size={10} className="shrink-0 text-green-400" />
                      <a href={url} target="_blank" rel="noreferrer"
                        className="max-w-[220px] truncate font-mono text-[10px] text-green-400 underline hover:text-green-300">{url}</a>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {dep.status === 'SUCCESS' && (
                    <span className="hidden sm:flex items-center gap-1 text-[10px] font-semibold text-green-400">
                      <CheckCircle2 size={11} /> Live
                    </span>
                  )}

                  {/* Logs in dialog — no redirect */}
                  <button type="button"
                    onClick={() => setLogsTarget({ id: dep.id, status: dep.status })}
                    className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
                    title="View logs">
                    <Terminal size={11} /> Logs
                  </button>

                  {isLive && (
                    <button type="button" onClick={() => void handleCancel(dep.id)} disabled={cancellingId === dep.id}
                      className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
                      title="Cancel">
                      {cancellingId === dep.id ? <Loader2 size={11} className="animate-spin" /> : <Square size={11} />}
                      <span className="hidden sm:inline">Cancel</span>
                    </button>
                  )}

                  {canRollback && (
                    <button type="button" onClick={() => void handleRollback(dep.id)} disabled={rollingBackId === dep.id}
                      className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-400 transition hover:bg-amber-500/20 disabled:opacity-50"
                      title="Rollback">
                      {rollingBackId === dep.id ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                      <span className="hidden sm:inline">Rollback</span>
                    </button>
                  )}

                  {canRollback && (
                    <button type="button"
                      onClick={() => setRedeployTarget({ branch: dep.branch, environmentId: envId })}
                      className="flex items-center gap-1 rounded-lg bg-[var(--text-primary)] px-2.5 py-1.5 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90"
                      title="Redeploy">
                      <Rocket size={11} />
                      <span className="hidden sm:inline">Redeploy</span>
                    </button>
                  )}

                  {confirmDeleteId === dep.id ? (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => void handleDelete(dep.id)} disabled={deletingId === dep.id}
                        className="flex items-center gap-1 rounded-lg border border-red-500/50 bg-red-500/20 px-2 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/30 disabled:opacity-50">
                        {deletingId === dep.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                        Confirm
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)}
                        className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmDeleteId(dep.id)}
                      className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:text-red-400"
                      title="Delete">
                      <Trash2 size={11} />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filtered.length > 20 && (
        <Link href={`/deployments?project=${projectId}`}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--border)] py-3 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
          <ExternalLink size={11} /> View all {filtered.length} deployments →
        </Link>
      )}

      {/* Logs dialog — inline, stays in Runs tab */}
      <DeploymentLogsDialog
        open={logsTarget !== null}
        deploymentId={logsTarget?.id ?? null}
        initialStatus={logsTarget?.status ?? null}
        onClose={() => setLogsTarget(null)}
      />

      {/* Redeploy dialog — branch + env pre-filled from original run */}
      <DeploymentCreateDialog
        open={redeployTarget !== null}
        initialProjectId={projectId}
        initialEnvironmentId={redeployTarget?.environmentId}
        initialBranch={redeployTarget?.branch}
        onClose={() => setRedeployTarget(null)}
        onCreated={async () => { setRedeployTarget(null); onRefresh?.(); }}
      />
    </div>
  );
}
