'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Clock, Container, Loader2, RefreshCw } from 'lucide-react';
import { monitoringService, type ContainerStats } from '@/services/monitoring.service';
import { serversService } from '@/services/servers.service';
import { getApiErrorMessage } from '@/lib/api';
import type { Server } from '@/types/server';

type Props = { projectId: string };

export function ContainersTab({ projectId }: Props) {
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [containers, setContainers] = useState<ContainerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setLoading(true);
    serversService.getAll()
      .then((list) => {
        setServers(list ?? []);
        if (list?.length && !selectedServerId) setSelectedServerId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadContainers = async (serverId: string) => {
    if (!serverId) return;
    setError(null);
    try {
      const stats = await monitoringService.listProjectContainers(projectId, serverId);
      setContainers(stats);
      setLastUpdated(new Date());
    } catch (err) {
      setError(getApiErrorMessage(err));
      setContainers([]);
    }
  };

  useEffect(() => {
    if (!selectedServerId) return;
    void loadContainers(selectedServerId);
    autoRefreshRef.current = setInterval(() => void loadContainers(selectedServerId), 30_000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [selectedServerId, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    if (!selectedServerId) return;
    setRefreshing(true);
    loadContainers(selectedServerId).finally(() => setRefreshing(false));
  };

  if (loading) return (
    <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-8 text-sm text-[var(--text-secondary)]">
      <Loader2 size={14} className="animate-spin" /> Loading containers…
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Container size={15} className="text-[var(--text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">Docker Containers</p>
          {lastUpdated && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
              <Clock size={9} /> {lastUpdated.toLocaleTimeString('en-GB', { hour12: false })}
            </span>
          )}
          <span className="text-[10px] text-[var(--text-muted)]">· auto-refresh 30s</span>
        </div>
        <div className="flex items-center gap-2">
          {servers.length > 0 && (
            <select value={selectedServerId ?? ''} onChange={(e) => setSelectedServerId(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none">
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name ?? s.host}</option>
              ))}
            </select>
          )}
          <button type="button" onClick={handleRefresh} disabled={refreshing || !selectedServerId}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-40">
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">{error}</div>
      )}

      {containers.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-12 text-center">
          <Box size={24} className="mb-2 text-[var(--text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">No containers running</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Deploy a service to see running containers.</p>
        </div>
      )}

      {containers.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-card)]/5">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Image</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Ports</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {containers.map((c, i) => (
                <tr key={c.containerId ?? i} className="hover:bg-[var(--bg-card)]/5 transition">
                  <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">{c.name ?? c.containerId?.slice(0, 12)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">—</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                      {'running'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
