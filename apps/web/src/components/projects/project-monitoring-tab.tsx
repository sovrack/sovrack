'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Box,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  ExternalLink,
  HardDrive,
  Loader2,
  RefreshCw,
  Server,
  XCircle,
} from 'lucide-react';
import { monitoringService, type ContainerStats } from '@/services/monitoring.service';
import { getApiErrorMessage } from '@/lib/api';
import type {
  MonitoredProject,
  MonitoredServer,
  MonitoringAlerts,
  MonitoringInstallOptions,
  MonitoringOverview,
} from '@/types/monitoring';

type Props = { projectId: string };

const HEALTH_COLOR: Record<string, string> = {
  HEALTHY: 'text-green-400',
  WARNING: 'text-amber-400',
  CRITICAL: 'text-red-400',
  UNKNOWN: 'text-zinc-400',
};

const CONTAINER_DOT: Record<string, string> = {
  running: 'bg-green-400',
  stopped: 'bg-amber-400',
  not_found: 'bg-zinc-500',
  unknown: 'bg-zinc-500',
};

function pct(v: number | null): string {
  return v === null || Number.isNaN(v) ? '—' : `${v.toFixed(0)}%`;
}
function uptime(sec: number | null): string {
  if (!sec) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

/**
 * Onglet Monitoring d'un projet — dual-mode :
 *  • mode léger (sans stack) : KPIs + serveurs + conteneurs live (SSH) + alertes.
 *  • mode complet (Prometheus/Grafana configurés) : + lien/embed Grafana.
 * Si la stack n'est pas installée, propose un panneau d'installation guidée.
 */
export function ProjectMonitoringTab({ projectId }: Props) {
  const [overview, setOverview] = useState<MonitoringOverview | null>(null);
  const [project, setProject] = useState<MonitoredProject | null>(null);
  const [servers, setServers] = useState<MonitoredServer[]>([]);
  const [alerts, setAlerts] = useState<MonitoringAlerts | null>(null);
  const [containers, setContainers] = useState<Record<string, ContainerStats[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const projectServers = useMemo(
    () => servers.filter((s) => s.linkedProjects.some((p) => p.id === projectId)),
    [servers, projectId],
  );

  const loadBase = useCallback(async () => {
    setError(null);
    try {
      const [ov, srv, projs, al] = await Promise.all([
        monitoringService.getOverview(),
        monitoringService.getServers(),
        monitoringService.getProjects(),
        monitoringService.getAlerts(),
      ]);
      setOverview(ov);
      setServers(srv);
      setProject(projs.find((p) => p.projectId === projectId) ?? null);
      setAlerts(al);
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  }, [projectId]);

  const loadContainers = useCallback(
    async (srv: MonitoredServer[]) => {
      const lists = await Promise.all(
        srv.map((s) =>
          monitoringService
            .listProjectContainers(projectId, s.serverId)
            .then((cs) => [s.serverId, cs] as const)
            .catch(() => [s.serverId, [] as ContainerStats[]] as const),
        ),
      );
      setContainers(Object.fromEntries(lists));
    },
    [projectId],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      await loadBase();
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [loadBase]);

  // Charge/rafraîchit les conteneurs dès que la liste des serveurs du projet change.
  useEffect(() => {
    if (projectServers.length > 0) void loadContainers(projectServers);
  }, [projectServers, loadContainers]);

  // Live : rafraîchit conteneurs (SSH) toutes les 10s.
  useEffect(() => {
    if (!live || projectServers.length === 0) return;
    const t = setInterval(() => void loadContainers(projectServers), 10_000);
    return () => clearInterval(t);
  }, [live, projectServers, loadContainers]);

  const refresh = async () => {
    setLoading(true);
    await loadBase();
    await loadContainers(projectServers);
    setLoading(false);
  };

  const allContainers = Object.values(containers).flat();
  const runningCount = allContainers.filter((c) => c.status === 'running').length;
  const projectAlerts = (alerts?.items ?? []).filter(
    (a) => a.status === 'firing' && (!a.projectId || a.projectId === projectId),
  );
  const stackOn = overview?.prometheus.configured ?? false;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Monitoring</p>
          <p className="text-xs text-[var(--text-secondary)]">Santé des serveurs et conteneurs de ce projet.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setLive((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${live ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-green-400' : 'bg-[var(--text-muted)]'}`} /> Live
          </button>
          <button type="button" onClick={() => void refresh()} disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition hover:text-[var(--text-primary)] disabled:opacity-40">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <XCircle size={14} /> {error}
        </div>
      )}

      {loading && !overview && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-8 text-sm text-[var(--text-secondary)]">
          <Loader2 size={14} className="animate-spin" /> Chargement du monitoring…
        </div>
      )}

      {/* Stack status band */}
      {overview && (
        <StackBand overview={overview} onInstalled={() => void refresh()} />
      )}

      {/* KPIs */}
      {overview && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Santé projet" value={project?.health ?? 'UNKNOWN'} color={HEALTH_COLOR[project?.health ?? 'UNKNOWN']} capitalize />
          <Kpi label="Serveurs" value={String(projectServers.length)} icon={<Server size={13} />} />
          <Kpi label="Conteneurs up" value={`${runningCount} / ${allContainers.length}`} icon={<Box size={13} />} />
          <Kpi label="Succès 7j" value={project?.successRate7d != null ? `${project.successRate7d}%` : '—'} icon={<CheckCircle2 size={13} />} />
        </div>
      )}

      {/* Servers */}
      {overview && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Serveurs</p>
          {projectServers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">Aucun serveur lié à ce projet.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
              {projectServers.map((s, i) => (
                <div key={s.serverId} className={`flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3 ${i !== 0 ? 'border-t border-[var(--border)]' : ''}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${s.metrics.up ? 'bg-green-400' : 'bg-zinc-500'}`} />
                  <span className="min-w-[140px] text-sm font-medium text-[var(--text-primary)]">{s.name}</span>
                  <span className="font-mono text-xs text-[var(--text-muted)]">{s.host}</span>
                  <Metric icon={<Cpu size={11} />} label="CPU" value={pct(s.metrics.cpuPercent)} />
                  <Metric icon={<Activity size={11} />} label="RAM" value={pct(s.metrics.memoryPercent)} />
                  <Metric icon={<HardDrive size={11} />} label="Disk" value={pct(s.metrics.diskPercent)} />
                  <span className="text-xs text-[var(--text-muted)]">↑ {uptime(s.metrics.uptimeSeconds)}</span>
                  <span className={`ml-auto text-xs font-semibold ${HEALTH_COLOR[s.monitoringStatus]}`}>{s.monitoringStatus}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Containers */}
      {overview && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Conteneurs</p>
          {allContainers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
              {loading ? 'Lecture des conteneurs…' : 'Aucun conteneur en cours pour ce projet.'}
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
              {allContainers.map((c, i) => (
                <div key={c.containerId || `${c.name}-${i}`} className={`flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3 ${i !== 0 ? 'border-t border-[var(--border)]' : ''}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${CONTAINER_DOT[c.status] ?? 'bg-zinc-500'} ${c.status === 'running' ? 'animate-pulse' : ''}`} />
                  <span className="min-w-[200px] truncate font-mono text-xs text-[var(--text-primary)]">{c.name}</span>
                  <Metric icon={<Cpu size={11} />} label="CPU" value={c.cpuPercent} />
                  <Metric icon={<Activity size={11} />} label="Mem" value={c.memPercent} />
                  <Metric icon={<Database size={11} />} label="Net" value={c.netIO} />
                  <span className={`ml-auto text-xs font-semibold capitalize ${c.status === 'running' ? 'text-green-400' : 'text-amber-400'}`}>{c.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Alerts */}
      {overview && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Alertes</p>
          {projectAlerts.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              <CheckCircle2 size={14} className="text-green-400" /> Aucune alerte active.
            </div>
          ) : (
            <div className="space-y-2">
              {projectAlerts.map((a) => (
                <div key={a.id} className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${a.severity === 'critical' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium">{a.summary}</p>
                    <p className="text-xs opacity-70">{new Date(a.startsAt).toLocaleString()} · {a.source}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Grafana embed (mode complet) */}
      {overview && stackOn && overview.grafana.configured && overview.grafana.url && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Grafana</p>
            <a href={overview.grafana.url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold text-orange-400 hover:underline">
              Ouvrir le dashboard complet <ExternalLink size={11} />
            </a>
          </div>
          <iframe
            src={`${overview.grafana.url.replace(/\/$/, '')}/?kiosk&theme=dark`}
            className="h-[420px] w-full rounded-2xl border border-[var(--border)] bg-black"
            title="Grafana"
          />
        </section>
      )}
    </div>
  );
}

function StackBand({ overview, onInstalled }: { overview: MonitoringOverview; onInstalled: () => void }) {
  const [installOpen, setInstallOpen] = useState(false);
  const ok = overview.prometheus.configured;

  if (ok) {
    return (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
          <span className={`h-2 w-2 rounded-full ${overview.prometheus.reachable ? 'bg-green-400' : 'bg-red-400'}`} />
          Prometheus
        </span>
        <span className="text-[var(--text-muted)]">{overview.prometheus.upTargets}/{overview.prometheus.totalTargets} targets up</span>
        <span className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
          <span className={`h-2 w-2 rounded-full ${overview.grafana.reachable ? 'bg-green-400' : 'bg-amber-400'}`} />
          Grafana {overview.grafana.version ?? ''}
        </span>
        {overview.grafana.url && (
          <a href={overview.grafana.url} target="_blank" rel="noreferrer"
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 font-semibold text-orange-400 transition hover:bg-orange-500/20">
            Open in Grafana <ExternalLink size={11} />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-500/25 bg-blue-500/8 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Activity size={18} className="mt-0.5 shrink-0 text-blue-400" />
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">Monitoring avancé non installé</p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Les stats live (CPU/Mém) marchent déjà via SSH. Installe <strong>Prometheus + Grafana</strong> pour l&apos;historique, les dashboards et les alertes.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setInstallOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90">
          <Download size={14} /> Installer
        </button>
      </div>
      {installOpen && <InstallPanel onInstalled={() => { setInstallOpen(false); onInstalled(); }} />}
    </div>
  );
}

function InstallPanel({ onInstalled }: { onInstalled: () => void }) {
  const [options, setOptions] = useState<MonitoringInstallOptions | null>(null);
  const [actionKey, setActionKey] = useState('');
  const [serverIds, setServerIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    monitoringService.getInstallOptions()
      .then((o) => {
        setOptions(o);
        const monit = o.actions.find((a) => a.category === 'monitoring');
        if (monit) setActionKey(monit.key);
      })
      .catch((e) => setErr(getApiErrorMessage(e)));
  }, []);

  const toggleServer = (id: string) =>
    setServerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const run = async () => {
    if (!actionKey || serverIds.length === 0) { setErr('Choisis une action et au moins un serveur.'); return; }
    setBusy(true); setErr(null); setMsg(null);
    try {
      await monitoringService.installMonitoring({ actionKey, serverIds });
      setMsg('Installation lancée (automation). Les métriques apparaîtront une fois terminée.');
      setTimeout(onInstalled, 1500);
    } catch (e) { setErr(getApiErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const monitoringActions = options?.actions.filter((a) => a.category === 'monitoring') ?? [];

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      {err && <p className="text-xs text-red-400">{err}</p>}
      {msg && <p className="text-xs text-green-400">{msg}</p>}

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Composants à installer</p>
        <select value={actionKey} onChange={(e) => setActionKey(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)]">
          {monitoringActions.map((a) => (
            <option key={a.key} value={a.key}>{a.label}</option>
          ))}
        </select>
        {actionKey && (
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">{monitoringActions.find((a) => a.key === actionKey)?.description}</p>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Serveur(s) cible(s)</p>
        <div className="space-y-1.5">
          {(options?.servers ?? []).map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--hover)]">
              <input type="checkbox" checked={serverIds.includes(s.id)} onChange={() => toggleServer(s.id)} disabled={!s.isVerified} />
              <span className="text-[var(--text-primary)]">{s.name}</span>
              <span className="font-mono text-xs text-[var(--text-muted)]">{s.host}</span>
              {!s.isVerified && <span className="ml-auto text-[10px] text-amber-400">non vérifié</span>}
            </label>
          ))}
        </div>
      </div>

      <button type="button" onClick={() => void run()} disabled={busy}
        className="flex items-center gap-1.5 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-50">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Lancer l&apos;installation
      </button>
    </div>
  );
}

function Kpi({ label, value, icon, color, capitalize }: { label: string; value: string; icon?: React.ReactNode; color?: string; capitalize?: boolean }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">{icon} {label}</div>
      <p className={`mt-1.5 text-2xl font-bold ${capitalize ? 'capitalize' : ''} ${color ?? 'text-[var(--text-primary)]'}`}>{value}</p>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
      <span className="text-[var(--text-muted)]">{icon}</span>
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-mono font-semibold text-[var(--text-primary)]">{value}</span>
    </span>
  );
}
