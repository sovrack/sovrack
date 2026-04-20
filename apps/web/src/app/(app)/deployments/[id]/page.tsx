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

function formatDate(str: string | null): string {
  if (!str) return '—';
  return new Date(str).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function duration(start: string | null, end: string | null): string {
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
      const updated = await deploymentsService.cancel(id);
      setDeployment(updated);
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
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700"
            >
              <ArrowLeft size={15} />
              Back to Deployments
            </Link>
            {resolvedStatus && <DeploymentStatusBadge status={resolvedStatus} />}
          </>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      )}

      {!loading && deployment && (
        <>
          <SectionCard title="Deployment details" contentClassName="p-5">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Project</p>
                <Link href={`/projects/${deployment.project.id}`}
                  className="mt-1 flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition">
                  {deployment.project.name} <ExternalLink size={12} />
                </Link>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Environment</p>
                <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  deployment.environment.name === 'PRODUCTION'
                    ? 'bg-red-50 text-red-600'
                    : 'bg-blue-50 text-blue-600'
                }`}>
                  {deployment.environment.name}
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Branch</p>
                <p className="mt-1 font-mono text-sm text-slate-700">{deployment.branch}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Triggered by</p>
                <p className="mt-1 text-sm text-slate-700">{deployment.user.fullName}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Started</p>
                <p className="mt-1 text-sm text-slate-700">{formatDate(deployment.startedAt)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Finished</p>
                <p className="mt-1 text-sm text-slate-700">{formatDate(deployment.finishedAt)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Duration</p>
                <p className="mt-1 flex items-center gap-1 text-sm text-slate-700">
                  <Clock size={12} className="text-slate-400" />
                  {duration(deployment.startedAt, deployment.finishedAt)}
                  {isActive && <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />}
                </p>
              </div>
              {deployment.dockerImage && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Image</p>
                  <p className="mt-1 font-mono text-xs text-slate-500 truncate">{deployment.dockerImage}</p>
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {isActive && canManageDeployment && (
                <button onClick={() => void handleCancel()} disabled={canceling}
                  className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                  {canceling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                  Cancel Deployment
                </button>
              )}
              {(resolvedStatus === 'SUCCESS' || resolvedStatus === 'FAILED') &&
                canRollbackDeployment && (
                <button onClick={() => void handleRollback()} disabled={rollingBack}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
                  {rollingBack ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  Rollback
                </button>
                )}
              {!isActive && canManageDeployment && (
                <Link href="/deployments/new"
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700">
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
                <span className="flex items-center gap-1.5 text-xs text-blue-600">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
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
