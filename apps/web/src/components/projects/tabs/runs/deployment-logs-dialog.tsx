'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Terminal, Wifi, WifiOff, Wrench, X, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { deploymentsService } from '@/services/deployments.service';
import { useDeploymentSocket } from '@/hooks/deployments/use-deployment-socket';
import type { Deployment, DeploymentStatus } from '@/types/deployment';

const STATUS_COLOR: Record<DeploymentStatus, string> = {
  RUNNING:  'text-blue-400',
  SUCCESS:  'text-green-400',
  FAILED:   'text-red-400',
  PENDING:  'text-amber-400',
  CANCELED: 'text-zinc-400',
};

const LINE_COLOR: Record<string, string> = {
  error:   'text-red-400',
  success: 'text-green-400',
  info:    'text-[var(--text-secondary)]',
};

type Props = {
  open: boolean;
  deploymentId: string | null;
  initialStatus?: DeploymentStatus | null;
  onClose: () => void;
};

export function DeploymentLogsDialog({ open, deploymentId, initialStatus, onClose }: Props) {
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [fetchingLogs, setFetchingLogs] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);


  const { logs, status, isConnected } = useDeploymentSocket({
    deploymentId: deploymentId ?? '',
    enabled: open && !!deploymentId,
    initialStatus: deployment?.status ?? initialStatus ?? null,
    initialLogs: deployment?.logs as string | null | undefined,
  });

  // Fetch full deployment when dialog opens to get static logs
  useEffect(() => {
    if (!open || !deploymentId) {
      setDeployment(null);
      setFetchError(null);
      return;
    }
    setFetchingLogs(true);
    deploymentsService.getById(deploymentId)
      .then(setDeployment)
      .catch(() => setFetchError('Failed to load deployment logs.'))
      .finally(() => setFetchingLogs(false));
  }, [open, deploymentId]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, open]);

  if (!open || !deploymentId) return null;

  const currentStatus = status ?? initialStatus;
  const liveActive = currentStatus === 'RUNNING' || currentStatus === 'PENDING';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div className="relative z-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl"
        style={{ maxHeight: '95vh' }}>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--hover)]">
            <Terminal size={15} className="text-[var(--text-secondary)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Deployment logs</p>
              {currentStatus && (
                <span className={`text-xs font-semibold ${STATUS_COLOR[currentStatus] ?? 'text-zinc-400'}`}>
                  {currentStatus}
                </span>
              )}
              {deployment?.branch && (
                <span className="font-mono text-xs text-[var(--text-muted)]">{deployment.branch}</span>
              )}
              {deployment?.environment?.name && (
                <span className="rounded border border-[var(--border)] bg-[var(--hover)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                  {deployment.environment.name}
                </span>
              )}
            </div>
            {deployment?.startedAt && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--text-muted)]">
                <Clock size={10} />
                {new Date(deployment.startedAt).toLocaleString()}
                {deployment.finishedAt && (
                  <span className="ml-1">
                    · {Math.round((new Date(deployment.finishedAt).getTime() - new Date(deployment.startedAt).getTime()) / 1000)}s
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {liveActive && (
              <div className="flex items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/8 px-2.5 py-1 text-xs text-blue-300">
                {isConnected
                  ? <><Wifi size={10} className="animate-pulse" /> Live</>
                  : <><WifiOff size={10} /> Connecting…</>}
              </div>
            )}
            <button type="button" onClick={onClose}
              className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text-primary)]">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Nixpacks hint — shown when server is missing the binary */}
        {deployment?.status === 'FAILED' && deployment.logs?.includes('Nixpacks binary not found') && (
          <div className="flex items-start gap-3 border-b border-amber-500/20 bg-amber-500/8 px-5 py-3">
            <Wrench size={14} className="mt-0.5 shrink-0 text-amber-400" />
            <div className="text-xs text-amber-300">
              <p className="font-semibold">Nixpacks is not installed on this server.</p>
              <p className="mt-0.5 text-amber-400/80">
                Ouvre <strong>Deploy → Prepare server</strong> et coche <strong>Nixpacks</strong>, ou change le Build Source en <strong>Dockerfile — Local</strong> dans Configuration → Build.
              </p>
            </div>
            <AlertTriangle size={13} className="ml-auto mt-0.5 shrink-0 text-amber-500" />
          </div>
        )}

        {/* Immutable Release info — frozen spec + structured status */}
        {deployment && (deployment.specSnapshot || deployment.imageSha || (deployment.conditions?.length ?? 0) > 0) && (() => {
          const snap = (deployment.specSnapshot ?? {}) as { source?: Record<string, unknown>; build?: Record<string, unknown> };
          const source = snap.source ?? {};
          const build = snap.build ?? {};
          const conditions = (deployment.conditions ?? []) as Array<Record<string, unknown>>;
          const cond = conditions[0];
          const sha = deployment.imageSha ?? null;
          return (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-[var(--border)] bg-[var(--hover)]/40 px-5 py-2.5 text-[11px]">
              <span className="font-semibold uppercase tracking-wide text-[var(--text-muted)]">Release</span>
              {typeof build.buildSource === 'string' && (
                <span className="text-[var(--text-secondary)]">Build: <span className="font-mono text-[var(--text-primary)]">{build.buildSource}</span></span>
              )}
              {typeof source.branch === 'string' && (
                <span className="text-[var(--text-secondary)]">Ref: <span className="font-mono text-[var(--text-primary)]">{source.branch}</span></span>
              )}
              {sha && (
                <span className="text-[var(--text-secondary)]">Digest: <span className="font-mono text-[var(--text-primary)]" title={sha}>{sha.replace('sha256:', '').slice(0, 12)}</span></span>
              )}
              {cond && typeof cond.type === 'string' && (
                <span className={clsx('ml-auto rounded px-1.5 py-0.5 font-semibold',
                  cond.type === 'Ready' ? 'bg-green-500/10 text-green-400'
                    : cond.type === 'Degraded' ? 'bg-red-500/10 text-red-400'
                      : 'bg-blue-500/10 text-blue-300')}
                  title={typeof cond.message === 'string' ? cond.message : undefined}>
                  {cond.type}{typeof cond.reason === 'string' ? ` · ${cond.reason}` : ''}
                </span>
              )}
            </div>
          );
        })()}

        {/* Log output */}
        <div className="flex-1 overflow-y-auto bg-zinc-950 p-4 font-mono text-xs leading-relaxed">
          {fetchingLogs && (
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <Loader2 size={12} className="animate-spin" /> Loading logs…
            </div>
          )}
          {fetchError && (
            <div className="flex items-center gap-2 text-red-400">
              <XCircle size={12} /> {fetchError}
            </div>
          )}
          {!fetchingLogs && logs.length === 0 && (
            <span className="text-zinc-600">No logs yet…</span>
          )}
          {logs.map((line, i) => (
            <div key={i} className={clsx('flex gap-3', LINE_COLOR[line.level ?? 'info'])}>
              <span className="shrink-0 text-zinc-600 select-none">
                {new Date(line.timestamp).toLocaleTimeString('en-GB', { hour12: false })}
              </span>
              <span className="whitespace-pre-wrap break-words min-w-0">{line.message}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            {currentStatus === 'SUCCESS' && <><CheckCircle2 size={12} className="text-green-400" /> Deployment succeeded</>}
            {currentStatus === 'FAILED'  && <><XCircle size={12} className="text-red-400" /> Deployment failed — check logs above</>}
            {liveActive && <><Loader2 size={12} className="animate-spin" /> Running…</>}
            {currentStatus === 'CANCELED' && 'Deployment canceled'}
          </div>
          <button type="button" onClick={onClose}
            className="rounded-xl border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
