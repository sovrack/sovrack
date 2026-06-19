'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { monitoringService, type ContainerInfo } from '@/services/monitoring.service';
import { getApiErrorMessage } from '@/lib/api';
import { SectionCard } from '@/components/layout/section-card';

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {k}
      </p>
      <p className="mt-1 font-mono text-sm font-bold capitalize text-[var(--text-primary)]">
        {v}
      </p>
    </div>
  );
}

/** Onglet Monitoring du service : métriques conteneur temps réel (refresh 5s). */
export function ServiceMonitoring({ deploymentId }: { deploymentId: string | null }) {
  const [info, setInfo] = useState<ContainerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);

  const fetchInfo = useCallback(async () => {
    if (!deploymentId) return;
    try {
      setInfo(await monitoringService.getContainerInfo(deploymentId, 0));
      setError(null);
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  }, [deploymentId]);

  useEffect(() => {
    void fetchInfo();
  }, [fetchInfo]);
  // Rafraîchissement LIVE toutes les 5s (CPU/Mém/Net en temps réel).
  useEffect(() => {
    if (!live || !deploymentId) return;
    const t = setInterval(() => {
      void fetchInfo();
    }, 5000);
    return () => clearInterval(t);
  }, [live, deploymentId, fetchInfo]);

  if (!deploymentId)
    return (
      <SectionCard title="Monitoring">
        <p className="text-sm text-[var(--text-muted)]">No deployment yet.</p>
      </SectionCard>
    );

  const running = info?.status === 'running';
  return (
    <SectionCard
      title="Container metrics"
      description="Stats temps réel du conteneur (rafraîchies toutes les 5s)."
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${live ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-green-400' : 'bg-[var(--text-muted)]'}`}
            />
            {live ? 'Live' : 'En pause'}
          </button>
          <button
            type="button"
            onClick={() => void fetchInfo()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {info && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat k="Status" v={info.status} />
            <Stat k="CPU" v={info.stats?.cpuPercent ?? '—'} />
            <Stat k="Memory" v={info.stats?.memPercent ?? '—'} />
            <Stat k="Net I/O" v={info.stats?.netIO ?? '—'} />
          </div>
        )}
        {info && !info.stats && (
          <p className="text-xs text-[var(--text-muted)]">
            {running
              ? 'Métriques en cours de collecte…'
              : 'Conteneur non démarré — métriques indisponibles.'}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
