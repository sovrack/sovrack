'use client';

import { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  GitBranch,
  Globe,
  Loader2,
  Rocket,
  RotateCcw,
  Server,
  Settings2,
  Terminal,
  Users,
} from 'lucide-react';
import type { ProjectDetail, GitlabConfig } from '@/types/project';
import type { Deployment, DeploymentStatus } from '@/types/deployment';
import type { Environment } from '@/types/environment';
import { deploymentsService } from '@/services/deployments.service';
import { getApiErrorMessage } from '@/lib/api';
import { useConfirm } from '@/contexts/confirm-context';
import { DeploymentStatusBadge } from '@/components/deployments/deployment-status-badge';
import { DeploymentLogsDialog } from '@/components/projects/tabs/runs/deployment-logs-dialog';
import { timeAgo, dur, resolveDeploymentUrl, ENV_BADGE } from '@/lib/deployment-utils';

/* ─── Types ──────────────────────────────────────────────────────────────── */

type Props = {
  project: ProjectDetail;
  lastDeployment?: Deployment | null;
  sourceConfig?: GitlabConfig | null;
  environments?: Environment[];
  onRollbackDone?: () => void;
  onTabChange?: (tab: string) => void;
  onDeploy?: () => void;
  onDeployService?: (serviceId: string, envId: string) => void;
};

/* ─── Component ──────────────────────────────────────────────────────────── */

export function ProjectOverview({
  project,
  lastDeployment,
  sourceConfig,
  environments = [],
  onRollbackDone,
  onTabChange,
  onDeploy,
  onDeployService,
}: Props) {
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [logsTarget, setLogsTarget] = useState<{ id: string; status: DeploymentStatus } | null>(null);
  const confirm = useConfirm();

  const canRollback = lastDeployment && (lastDeployment.status === 'SUCCESS' || lastDeployment.status === 'FAILED');

  const handleRollback = async () => {
    if (!lastDeployment) return;
    if (!(await confirm({ title: 'Rollback to the previous stable version?', confirmLabel: 'Roll back', variant: 'danger' }))) return;
    setRollingBack(true); setRollbackError(null);
    try { await deploymentsService.rollback(lastDeployment.id); onRollbackDone?.(); }
    catch (err) { setRollbackError(getApiErrorMessage(err)); }
    finally { setRollingBack(false); }
  };

  return (
    <div className="space-y-5">


      {/* ── Stats row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Environments', value: environments.length, icon: <Server size={13} />, tab: 'environments' },
          { label: 'Members', value: project.members.length, icon: <Users size={13} />, tab: 'settings' },
          { label: 'Branch', value: sourceConfig?.defaultBranch ?? '—', icon: <GitBranch size={13} />, tab: 'services', mono: true },
        ].map(({ label, value, icon, tab, mono }) => (
          <button
            key={label}
            type="button"
            onClick={() => onTabChange?.(tab)}
            className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-left transition hover:border-[var(--text-primary)]/20 hover:bg-[var(--hover)]"
          >
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {icon} {label}
            </p>
            <p className={`mt-2 truncate font-bold text-[var(--text-primary)] ${mono ? 'font-mono text-sm' : 'text-2xl'}`}>
              {value}
            </p>
          </button>
        ))}
      </div>

      {/* ── Environments status grid ────────────────────────────── */}
      {environments.length > 0 && (
        <div>
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Environments</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {environments.map((env) => {
              const envServices = env.serviceLinks ?? [];

              return (
                <div key={env.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ENV_BADGE[env.name] ?? 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400'}`}>
                        {env.name}
                      </span>
                    </div>
                    <span className={`flex items-center gap-1 text-[10px] font-semibold ${envServices.length > 0 ? 'text-green-400' : 'text-amber-400'}`}>
                      {envServices.length > 0 ? <CheckCircle2 size={10} /> : <Activity size={10} />}
                      {envServices.length > 0 ? `${envServices.length} service${envServices.length > 1 ? 's' : ''}` : 'No services'}
                    </span>
                  </div>

                  {envServices.length > 0 && (
                    <div className="mt-3 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] overflow-hidden">
                      {envServices.map((link) => {
                        const dep = link.lastDeployment;
                        const statusColor: Record<string, string> = {
                          SUCCESS: 'text-green-400',
                          FAILED: 'text-red-400',
                          RUNNING: 'text-blue-400',
                          PENDING: 'text-amber-400',
                          CANCELED: 'text-zinc-400',
                        };
                        return (
                          <div key={link.id} className="flex items-center gap-2 bg-[var(--hover)] px-3 py-2">
                            <span className="flex-1 min-w-0">
                              <span className="font-medium text-xs text-[var(--text-primary)] truncate">{link.service?.name ?? '?'}</span>
                              {dep && (
                                <span className={`ml-2 text-[10px] font-semibold ${statusColor[dep.status] ?? 'text-zinc-400'}`}>
                                  {dep.status}
                                </span>
                              )}
                              {dep?.branch && (
                                <span className="ml-2 font-mono text-[10px] text-[var(--text-muted)]">
                                  {dep.branch}
                                </span>
                              )}
                              {dep?.createdAt && (
                                <span className="ml-2 text-[10px] text-[var(--text-muted)]">
                                  · {timeAgo(dep.createdAt)}
                                </span>
                              )}
                            </span>
                            {onDeployService && (
                              <button
                                type="button"
                                onClick={() => onDeployService(link.serviceId, env.id)}
                                className="shrink-0 flex items-center gap-1 rounded-lg bg-[var(--text-primary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--bg-app)] transition hover:opacity-90"
                              >
                                <Rocket size={8} /> Deploy
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-2 border-t border-[var(--border)] pt-3">
                    <button
                      type="button"
                      onClick={() => onTabChange?.('environments')}
                      className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
                    >
                      <Settings2 size={9} /> Configure
                    </button>
                    {onDeploy && (
                      <button
                        type="button"
                        onClick={onDeploy}
                        className="flex items-center gap-1 rounded-lg bg-[var(--text-primary)] px-2.5 py-1 text-[10px] font-semibold text-[var(--bg-app)] transition hover:opacity-90"
                      >
                        <Rocket size={9} /> Deploy
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Last deployment ─────────────────────────────────────── */}
      {lastDeployment ? (
        <div>
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Latest run</p>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <DeploymentStatusBadge status={lastDeployment.status} size="sm" />
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${ENV_BADGE[lastDeployment.environment.name] ?? ''}`}>
                    {lastDeployment.environment.name}
                  </span>
                  <span className="font-mono text-xs text-[var(--text-muted)]">{lastDeployment.branch}</span>
                  {lastDeployment.service && (
                    <span className="rounded border border-[var(--border)] bg-[var(--hover)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                      {lastDeployment.service.name}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                  <span>{lastDeployment.user.fullName} · {timeAgo(lastDeployment.createdAt)}</span>
                  {dur(lastDeployment.startedAt, lastDeployment.finishedAt) && (
                    <span className="flex items-center gap-1"><Clock size={10} /> {dur(lastDeployment.startedAt, lastDeployment.finishedAt)}</span>
                  )}
                </div>

                {(() => {
                  const url = resolveDeploymentUrl(lastDeployment);
                  if (!url || lastDeployment.status !== 'SUCCESS') return null;
                  return (
                    <div className="mt-3 flex items-center gap-2">
                      <Globe size={13} className="text-green-400" />
                      <a href={url} target="_blank" rel="noreferrer" className="font-mono text-xs text-green-400 underline hover:text-green-300 truncate max-w-xs">{url}</a>
                      <a href={url} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-semibold text-green-400 hover:bg-green-500/20 transition">Open ↗</a>
                    </div>
                  );
                })()}
                {rollbackError && <p className="mt-2 text-xs text-red-400">{rollbackError}</p>}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={() => setLogsTarget({ id: lastDeployment.id, status: lastDeployment.status })}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--hover)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                >
                  <Terminal size={11} /> View logs
                </button>
                {canRollback && (
                  <button
                    type="button"
                    onClick={() => void handleRollback()}
                    disabled={rollingBack}
                    className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400 transition hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    {rollingBack ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                    Rollback
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-12 text-center">
          <Rocket size={28} className="mb-3 text-[var(--text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">No deployments yet</p>
          <p className="mt-1 max-w-xs text-xs text-[var(--text-secondary)]">Launch your first deployment.</p>
          {onDeploy && (
            <button
              type="button"
              onClick={onDeploy}
              className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90"
            >
              <Rocket size={14} /> Deploy now
            </button>
          )}
        </div>
      )}

      <DeploymentLogsDialog
        open={logsTarget !== null}
        deploymentId={logsTarget?.id ?? null}
        initialStatus={logsTarget?.status ?? null}
        onClose={() => setLogsTarget(null)}
      />
    </div>
  );
}
