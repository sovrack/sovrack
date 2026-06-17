'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Box, Loader2, RefreshCw, X, XCircle } from 'lucide-react';
import { monitoringService, type ContainerInfo } from '@/services/monitoring.service';
import { getApiErrorMessage } from '@/lib/api';

type Props = {
  open: boolean;
  deploymentId: string | null;
  onClose: () => void;
};

const STATUS_COLOR: Record<string, string> = {
  running: 'text-green-400',
  stopped: 'text-amber-400',
  not_found: 'text-zinc-400',
  unknown: 'text-zinc-400',
};

/**
 * Dialog "Docker container" : statut + stats (CPU/Mém/Net) + logs runtime du
 * conteneur (docker logs sur le serveur cible). Remplace l'ancienne page de
 * détail ; ouvert depuis un bouton dédié dans la liste des déploiements.
 */
export function DeploymentContainerDialog({ open, deploymentId, onClose }: Props) {
  const [info, setInfo] = useState<ContainerInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchInfo = useCallback(async () => {
    if (!deploymentId) return;
    setLoading(true);
    setError(null);
    try {
      setInfo(await monitoringService.getContainerInfo(deploymentId, 200));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [deploymentId]);

  // Load on open, reset on close.
  useEffect(() => {
    if (open && deploymentId) {
      void fetchInfo();
    } else {
      setInfo(null);
      setError(null);
      setLive(false);
    }
  }, [open, deploymentId, fetchInfo]);

  // Live auto-refresh (5s) while enabled.
  useEffect(() => {
    if (!open || !live) return;
    const t = setInterval(() => void fetchInfo(), 5000);
    return () => clearInterval(t);
  }, [open, live, fetchInfo]);

  // Auto-scroll logs to bottom on update.
  useEffect(() => {
    if (open && info?.logs) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [info?.logs, open]);

  if (!open || !deploymentId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl"
        style={{ maxHeight: '95vh' }}>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--hover)]">
            <Box size={15} className="text-[var(--text-secondary)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Docker container</p>
              {info && (
                <span className={`text-xs font-semibold capitalize ${STATUS_COLOR[info.status] ?? 'text-zinc-400'}`}>
                  {info.status}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Stats &amp; logs runtime du conteneur sur le serveur cible.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setLive((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${live ? 'border-blue-500/30 bg-blue-500/10 text-blue-300' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
              <Activity size={11} className={live ? 'animate-pulse' : ''} /> Live
            </button>
            <button type="button" onClick={() => void fetchInfo()} disabled={loading}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition hover:text-[var(--text-primary)] disabled:opacity-40">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
            <button type="button" onClick={onClose}
              className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text-primary)]">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="border-b border-[var(--border)] px-5 py-3">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              <XCircle size={14} /> {error}
            </div>
          )}
          {!error && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Status" value={info?.status ?? '—'} mono={false}
                color={info ? STATUS_COLOR[info.status] : undefined} />
              <Stat label="CPU" value={info?.stats?.cpuPercent ?? '—'} />
              <Stat label="Memory" value={info?.stats?.memPercent ?? '—'} sub={info?.stats?.memUsage} />
              <Stat label="Net I/O" value={info?.stats?.netIO ?? '—'} />
            </div>
          )}
        </div>

        {/* Logs */}
        <div className="flex-1 overflow-y-auto bg-zinc-950 p-4 font-mono text-xs leading-relaxed">
          {loading && !info && (
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <Loader2 size={12} className="animate-spin" /> Connexion SSH et récupération des logs…
            </div>
          )}
          {!loading && info && !info.logs && (
            <span className="text-zinc-600">Aucun log de conteneur.</span>
          )}
          {info?.logs && (
            <pre className="whitespace-pre-wrap break-words text-green-300">{info.logs}</pre>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-[var(--border)] px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, mono = true, color }: { label: string; value: string; sub?: string; mono?: boolean; color?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className={`mt-1 text-sm font-bold ${mono ? 'font-mono' : 'capitalize'} ${color ?? 'text-[var(--text-primary)]'}`}>{value}</p>
      {sub && <p className="font-mono text-[10px] text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}
