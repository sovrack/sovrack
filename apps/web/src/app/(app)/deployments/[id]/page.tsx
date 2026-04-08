'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Rocket, XCircle, RotateCcw, Loader2, Clock, ExternalLink } from 'lucide-react';
import { deploymentsService } from '@/services/deployments.service';
import { getApiErrorMessage } from '@/lib/api';
import { DeploymentStatusBadge } from '@/components/deployments/deployment-status-badge';
import { DeploymentLogs } from '@/components/deployments/deployment-logs';
import { useAuthContext } from '@/contexts/auth-context';
import type { Deployment } from '@/types/deployment';

type Props = { params: Promise<{ id: string }> };

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
  const { isAdmin } = useAuthContext();

  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

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

  // Poll every 3s while PENDING or RUNNING
  useEffect(() => {
    void fetchDeployment().then((dep) => {
      if (dep?.status === 'PENDING' || dep?.status === 'RUNNING') {
        pollingRef.current = setInterval(async () => {
          const updated = await fetchDeployment();
          if (updated && updated.status !== 'PENDING' && updated.status !== 'RUNNING') {
            if (pollingRef.current) clearInterval(pollingRef.current);
          }
        }, 3000);
      }
    });

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchDeployment]);

  const handleCancel = async () => {
    if (!confirm('Cancel this deployment?')) return;
    setCanceling(true);
    setActionError(null);
    try {
      const updated = await deploymentsService.cancel(id);
      setDeployment(updated);
      if (pollingRef.current) clearInterval(pollingRef.current);
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

  const isActive = deployment?.status === 'PENDING' || deployment?.status === 'RUNNING';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/deployments" className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700">
          <ArrowLeft size={15} /> Back to Deployments
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
              <Rocket size={20} className="text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {loading ? 'Loading…' : `${deployment?.project.name} → ${deployment?.environment.name}`}
              </h1>
              {deployment && (
                <p className="font-mono text-xs text-slate-400">{id}</p>
              )}
            </div>
          </div>
          {deployment && (
            <DeploymentStatusBadge status={deployment.status} />
          )}
        </div>
      </div>

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
          {/* Meta card */}
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
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

            {/* Actions */}
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {isActive && (
                <button onClick={() => void handleCancel()} disabled={canceling}
                  className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                  {canceling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                  Cancel Deployment
                </button>
              )}
              {(deployment.status === 'SUCCESS' || deployment.status === 'FAILED') && isAdmin && (
                <button onClick={() => void handleRollback()} disabled={rollingBack}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
                  {rollingBack ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  Rollback
                </button>
              )}
              {!isActive && (
                <Link href="/deployments/new"
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700">
                  <Rocket size={14} /> Deploy Again
                </Link>
              )}
            </div>
          </div>

          {/* Logs */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Deployment Logs</h2>
              {isActive && (
                <span className="flex items-center gap-1.5 text-xs text-blue-600">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Live — refreshing every 3s
                </span>
              )}
            </div>
            <DeploymentLogs logs={deployment.logs} />
          </div>
        </>
      )}
    </div>
  );
}
