'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Rocket, XCircle, RotateCcw, Loader2, Clock, ExternalLink } from 'lucide-react';
import { deploymentsService } from '@/services/deployments.service';
import { projectsService } from '@/services/projects.service';
import { getApiErrorMessage } from '@/lib/api';
import { DeploymentStatusBadge } from '@/components/deployments/deployment-status-badge';
import { LogTerminal } from '@/components/log-terminal';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { useAuthContext } from '@/contexts/auth-context';
import { useDeploymentSocket } from '@/hooks/useDeploymentSocket';
import type { Deployment, DeploymentStatus, LogLine } from '@/types/deployment';
import type { ProjectRole } from '@/types/project';

type Props = { params: Promise<{ id: string }> };

function isActiveStatus(status: DeploymentStatus | null): boolean {
  return status === 'PENDING' || status === 'RUNNING';
}

function inferLogLevel(message: string): LogLine['level'] {
  if (/error|fail|fatal|exception/i.test(message)) {
    return 'error';
  }

  if (/success|ok|done|completed|ready/i.test(message)) {
    return 'success';
  }

  return 'info';
}

function parseStaticLogs(logs: string | null): LogLine[] {
  if (!logs) {
    return [];
  }

  return logs
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((message) => ({
      timestamp: new Date().toISOString(),
      message,
      level: inferLogLevel(message),
    }));
}

function formatDate(str: string | null | undefined): string {
  if (!str) return '—';
  return new Date(str).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function duration(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start) return '—';
  const ms = new Date(end ?? Date.now()).getTime() - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function DeploymentDetailPage({ params }: Props) {
  const { id } = use(params);
  const { user, isAdmin } = useAuthContext();

  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [projectRole, setProjectRole] = useState<ProjectRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  const fetchDeployment = useCallback(async () => {
    try {
      const dep = await deploymentsService.getById(id);
      setDeployment(dep);
      return dep;
    } catch (err) {
      setError(getApiErrorMessage(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Charge les détails une première fois.
  useEffect(() => {
    void fetchDeployment();
  }, [fetchDeployment]);

  useEffect(() => {
    setProjectRole(null);
  }, [id]);

  const liveEnabled = Boolean(deployment && isActiveStatus(deployment.status));
  const { logs: liveLogs, status: liveStatus, isConnected } = useDeploymentSocket({
    deploymentId: id,
    enabled: liveEnabled,
    initialLogs: deployment?.logs ?? null,
    initialStatus: deployment?.status ?? null,
  });

  // Synchronise le statut live dans l'état local de la page.
  useEffect(() => {
    if (!liveStatus) {
      return;
    }

    setDeployment((current) => {
      if (!current || current.status === liveStatus) {
        return current;
      }

      return {
        ...current,
        status: liveStatus,
      };
    });

    // Quand le déploiement se termine, on recharge la fiche complète.
    if (!isActiveStatus(liveStatus)) {
      void fetchDeployment();
    }
  }, [fetchDeployment, liveStatus]);

  useEffect(() => {
    if (!deployment || !user?.id || isAdmin) {
      return;
    }

    let cancelled = false;

    void projectsService
      .getById(deployment.project.id)
      .then((project) => {
        if (cancelled) {
          return;
        }

        const membership = project.members.find(
          (member) => member.user.id === user.id,
        );
        setProjectRole(membership?.role ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setProjectRole(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deployment, isAdmin, user?.id]);

  const handleCancel = async () => {
    if (!confirm('Cancel this deployment?')) return;
    setCanceling(true);
    setActionError(null);
    try {
      await deploymentsService.cancel(id);
      await fetchDeployment();
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    } finally {
      setCanceling(false);
    }
  };

  const handleRollback = async () => {
    if (!confirm('Roll back to the previous deployment?')) return;
    setRollingBack(true);
    setActionError(null);
    try {
      const newDep = await deploymentsService.rollback(id);
      // Navigate to the new rollback deployment
      window.location.href = `/deployments/${newDep.id}`;
    } catch (err) {
      setActionError(getApiErrorMessage(err));
      setRollingBack(false);
    }
  };

  const resolvedStatus = deployment ? (liveStatus ?? deployment.status) : null;
  const isActive = isActiveStatus(resolvedStatus);
  const canManageDeployment =
    isAdmin || projectRole === 'OWNER' || projectRole === 'DEVELOPER';
  const canRollbackDeployment = isAdmin || projectRole === 'OWNER';
  const staticLogs = useMemo(() => parseStaticLogs(deployment?.logs ?? null), [deployment?.logs]);
  const displayedLogs = isActive ? liveLogs : staticLogs;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Deployments"
        title={loading ? 'Loading…' : `${deployment?.project.name} → ${deployment?.environment.name}`}
        description={deployment ? `Deployment ${id}` : 'Loading deployment details and live logs.'}
        actions={
          <>
            <Link
              href="/deployments"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              <ArrowLeft size={15} />
              Back to Deployments
            </Link>
            {resolvedStatus && <DeploymentStatusBadge status={resolvedStatus} />}
          </>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}
      {actionError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{actionError}</div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-2xl bg-[var(--bg-card)]/10" />
          <div className="h-64 animate-pulse rounded-2xl bg-[var(--bg-card)]/10" />
        </div>
      )}

      {!loading && deployment && (
        <>
          <SectionCard title="Deployment details" contentClassName="p-5">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Project</p>
                <Link href={`/projects/${deployment.project.id}`}
                  className="mt-1 flex items-center gap-1 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-secondary)] transition">
                  {deployment.project.name} <ExternalLink size={12} />
                </Link>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Environment</p>
                <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  deployment.environment.name === 'PRODUCTION'
                    ? 'bg-red-500/15 text-red-300'
                    : 'bg-[var(--text-primary)]/15 text-[var(--text-secondary)]'
                }`}>
                  {deployment.environment.name}
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Branch</p>
                <p className="mt-1 font-mono text-sm text-[var(--text-primary)]">{deployment.branch}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Triggered by</p>
                <p className="mt-1 text-sm text-[var(--text-primary)]">{deployment.user.fullName}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Started</p>
                <p className="mt-1 text-sm text-[var(--text-primary)]">{formatDate(deployment.startedAt)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Finished</p>
                <p className="mt-1 text-sm text-[var(--text-primary)]">{formatDate(deployment.finishedAt)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Duration</p>
                <p className="mt-1 flex items-center gap-1 text-sm text-[var(--text-primary)]">
                  <Clock size={12} className="text-[var(--text-secondary)]" />
                  {duration(deployment.startedAt, deployment.finishedAt)}
                  {isActive && <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-[var(--text-primary)] animate-pulse" />}
                </p>
              </div>
              {deployment.dockerImage && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Image</p>
                  <p className="mt-1 font-mono text-xs text-[var(--text-secondary)] truncate">{deployment.dockerImage}</p>
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
              {isActive && canManageDeployment && (
                <button onClick={() => void handleCancel()} disabled={canceling}
                  className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50">
                  {canceling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                  Cancel Deployment
                </button>
              )}
              {(resolvedStatus === 'SUCCESS' || resolvedStatus === 'FAILED') &&
                canRollbackDeployment && (
                <button onClick={() => void handleRollback()} disabled={rollingBack}
                  className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-card)]/10 disabled:opacity-50">
                  {rollingBack ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  Rollback
                </button>
                )}
              {!isActive && canManageDeployment && (
                <Link href="/deployments?dialog=create-deployment"
                  className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90">
                  <Rocket size={14} /> Deploy Again
                </Link>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Deployment Logs"
            description={isActive ? 'Live logs are streamed from the deployment socket.' : 'Static logs from the finished deployment.'}
          >
            <div className="mb-3 flex items-center justify-between">
              {isActive && (
                <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--text-primary)] animate-pulse" />
                  Live — {isConnected ? 'WebSocket connecté' : 'reconnexion…'}
                </span>
              )}
            </div>
            <LogTerminal logs={displayedLogs} isLive={isActive} />
          </SectionCard>
        </>
      )}
    </div>
  );
}
