'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Clock,
  Container,
  Cpu,
  HardDrive,
  Loader2,
  RefreshCw,
  Server,
  Wifi,
} from 'lucide-react';
import { monitoringService, type ContainerStats } from '@/services/monitoring.service';
import { environmentsService } from '@/services/environments.service';
import { getApiErrorMessage } from '@/lib/api';
import type { Environment } from '@/types/environment';

type Props = { projectId: string };

export function ContainersTab({ projectId }: Props) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedServerId, setSelectedServerId] = useState('');
  const [containers, setContainers] = useState<ContainerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadEnvironments = () =>
    environmentsService.getAll(projectId)
      .then((envs) => {
        setEnvironments(envs);
        const first = envs.find((e) => e.serverId);
        if (first && !selectedServerId) setSelectedServerId(first.serverId);
      })
      .catch(() => {});

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
    setLoading(true);
    loadEnvironments().finally(() => setLoading(false));
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedServerId) return;
    void loadContainers(selectedServerId);
    autoRefreshRef.current = setInterval(() => void loadContainers(selectedServerId), 30_000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [selectedServerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    if (!selectedServerId) return;
    setRefreshing(true);
    loadContainers(selectedServerId).finally(() => setRefreshing(false));
  };

  const serverIds = [...new Set(environments.filter((e) => e.serverId).map((e) => e.serverId))] as string[];

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
          {serverIds.length > 0 && (
            <select value={selectedServerId} onChange={(e) => setSelectedServerId(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none">
              {serverIds.map((sid) => {
                const env = environments.find((e) => e.serverId === sid);
                return <option key={sid} value={sid}>{env?.server?.name ?? sid}</option>;
              })}
            </select>
          )}
          <button type="button" onClick={handleRefresh} disabled={refreshing || !selectedServerId}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-40">
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {!selectedServerId && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-14 text-center">
          <Server size={28} className="mb-3 text-[var(--text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">No servers configured</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Add an environment with a VPS to see container metrics.</p>
        </div>
      )}

      {selectedServerId && containers.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-14 text-center">
          <Container size={28} className="mb-3 text-[var(--text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">No running containers</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Deploy your project to see container metrics here.</p>
        </div>
      )}

      {containers.length > 0 && (
        <div className="space-y-2">
          {containers.map((c) => (
            <div key={c.containerId} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`h-2 w-2 shrink-0 rounded-full ${
                    c.status === 'running' ? 'bg-green-400 animate-pulse'
                    : c.status === 'stopped' ? 'bg-red-400'
                    : 'bg-zinc-400'}`} />
                  <Container size={13} className="shrink-0 text-[var(--text-muted)]" />
                  <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{c.name}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">{c.containerId.slice(0, 12)}</span>
                </div>
                <span className={`text-[10px] font-semibold uppercase ${
                  c.status === 'running' ? 'text-green-400'
                  : c.status === 'stopped' ? 'text-red-400'
                  : 'text-zinc-400'}`}>
                  {c.status}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { icon: <Cpu size={10} />, label: 'CPU',     value: c.cpuPercent },
                  { icon: <HardDrive size={10} />, label: 'Memory',  value: `${c.memUsage} (${c.memPercent})` },
                  { icon: <Wifi size={10} />, label: 'Network', value: c.netIO },
                  { icon: <Activity size={10} />, label: 'PIDs',    value: String(c.pids) },
                ].map(({ icon, label, value }) => (
                  <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--hover)] px-3 py-2">
                    <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">{icon} {label}</div>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-[var(--text-primary)]">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
