'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ExternalLink,
  Loader2,
  RefreshCw,
  Server,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { getApiErrorMessage } from '@/lib/api';
import { monitoringService } from '@/services/monitoring.service';
import type {
  MonitoredProject,
  MonitoredServer,
  MonitoringAlerts,
  MonitoringDeployments,
  MonitoringInstallOptions,
  MonitoringOverview,
} from '@/types/monitoring';

function healthTone(value: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN') {
  if (value === 'HEALTHY') return 'success' as const;
  if (value === 'WARNING') return 'warning' as const;
  if (value === 'CRITICAL') return 'error' as const;
  return 'default' as const;
}

function formatMetric(value: number | null, suffix = ''): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(1)}${suffix}`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString();
}

export default function MonitoringPage() {
  const [overview, setOverview] = useState<MonitoringOverview | null>(null);
  const [servers, setServers] = useState<MonitoredServer[]>([]);
  const [projects, setProjects] = useState<MonitoredProject[]>([]);
  const [deployments, setDeployments] = useState<MonitoringDeployments | null>(null);
  const [alerts, setAlerts] = useState<MonitoringAlerts | null>(null);
  const [installOptions, setInstallOptions] = useState<MonitoringInstallOptions | null>(null);
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        overviewData,
        serversData,
        projectsData,
        deploymentsData,
        alertsData,
        installData,
      ] = await Promise.all([
        monitoringService.getOverview(),
        monitoringService.getServers(),
        monitoringService.getProjects(),
        monitoringService.getDeployments(),
        monitoringService.getAlerts(),
        monitoringService.getInstallOptions(),
      ]);

      setOverview(overviewData);
      setServers(serversData);
      setProjects(projectsData);
      setDeployments(deploymentsData);
      setAlerts(alertsData);
      setInstallOptions(installData);

      if (!selectedAction && installData.actions.length > 0) {
        setSelectedAction(installData.actions[0].key);
      }
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [selectedAction]);

  useEffect(() => {
    void load();
  }, [load]);

  const criticalServers = useMemo(
    () => servers.filter((server) => server.monitoringStatus === 'CRITICAL').length,
    [servers],
  );

  const handleToggleServer = (serverId: string) => {
    setSelectedServers((prev) =>
      prev.includes(serverId)
        ? prev.filter((id) => id !== serverId)
        : [...prev, serverId],
    );
  };

  const handleInstall = async () => {
    if (!selectedAction || selectedServers.length === 0) {
      setError('Select an action and at least one server.');
      return;
    }

    setInstalling(true);
    setError(null);
    setSuccess(null);
    try {
      const run = await monitoringService.installMonitoring({
        actionKey: selectedAction,
        serverIds: selectedServers,
      });
      const runId =
        typeof run === 'object' && run && 'id' in run
          ? String((run as { id: string }).id)
          : null;
      setSuccess(
        runId
          ? `Monitoring installation started (run ${runId.slice(0, 8)}).`
          : 'Monitoring installation started.',
      );
      setSelectedServers([]);
      await load();
    } catch (installError) {
      setError(getApiErrorMessage(installError));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Monitoring"
        description="Prometheus + Grafana monitoring linked to VPS, projects, and deployments."
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </Button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Monitored servers', value: overview?.totalMonitoredServers ?? 0 },
          { label: 'Healthy', value: overview?.healthy ?? 0 },
          { label: 'Warning', value: overview?.warning ?? 0 },
          { label: 'Critical', value: overview?.critical ?? 0 },
          {
            label: 'Grafana',
            value: overview?.grafana.reachable ? 'Up' : 'Down',
          },
          {
            label: 'Prometheus',
            value: overview?.prometheus.reachable ? 'Up' : 'Down',
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3"
          >
            <p className="text-xs font-medium text-[var(--text-muted)]">{item.label}</p>
            <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
              {String(item.value)}
            </p>
          </div>
        ))}
      </div>

      <SectionCard
        title="Monitoring Installation"
        description="Install monitoring stack components through allowlisted multi-VPS automation."
      >
        {!installOptions ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Loading installation options...
          </p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
              {installOptions.executionModel}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                  Monitoring action
                </label>
                <select
                  value={selectedAction}
                  onChange={(event) => setSelectedAction(event.target.value)}
                  className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-primary)] outline-none"
                >
                  {installOptions.actions.map((action) => (
                    <option key={action.key} value={action.key}>
                      {action.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                  Target VPS
                </label>
                <div className="max-h-40 space-y-2 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--hover)] p-3">
                  {installOptions.servers.map((server) => (
                    <label
                      key={server.id}
                      className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                    >
                      <span className="truncate">
                        {server.name} ({server.host})
                      </span>
                      <input
                        type="checkbox"
                        checked={selectedServers.includes(server.id)}
                        onChange={() => handleToggleServer(server.id)}
                        disabled={!server.isVerified}
                        className="accent-zinc-500"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <Button
              onClick={() => void handleInstall()}
              disabled={installing || selectedServers.length === 0 || !selectedAction}
              loading={installing}
              icon={installing ? undefined : <Wrench size={14} />}
            >
              Run Monitoring Installation
            </Button>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Prometheus Status"
        description="Targets, exporters, and scrape readiness."
      >
        {overview ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Badge tone={overview.prometheus.reachable ? 'success' : 'error'}>
                {overview.prometheus.reachable ? 'Reachable' : 'Unreachable'}
              </Badge>
              <p className="text-sm text-[var(--text-secondary)]">{overview.prometheus.message}</p>
              {overview.prometheus.url && (
                <a
                  href={overview.prometheus.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-400 hover:underline"
                >
                  Open Prometheus <ExternalLink size={13} />
                </a>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Targets', value: overview.prometheus.totalTargets },
                { label: 'Up', value: overview.prometheus.upTargets },
                { label: 'Down', value: overview.prometheus.downTargets },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-[var(--border)] bg-[var(--hover)] px-3 py-2"
                >
                  <p className="text-xs text-[var(--text-secondary)]">{item.label}</p>
                  <p className="text-lg font-semibold text-[var(--text-primary)]">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Loader2 size={18} className="animate-spin text-[var(--text-secondary)]" />
        )}
      </SectionCard>

      <SectionCard
        title="Grafana Access"
        description="Dashboard endpoint and connectivity state."
      >
        {overview ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <Badge tone={overview.grafana.reachable ? 'success' : 'error'}>
                {overview.grafana.reachable ? 'Reachable' : 'Unreachable'}
              </Badge>
              <p className="text-sm text-[var(--text-secondary)]">{overview.grafana.message}</p>
            </div>
            {overview.grafana.url && (
              <a
                href={overview.grafana.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--hover)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--border)]"
              >
                Open Grafana <ExternalLink size={13} />
              </a>
            )}
          </div>
        ) : (
          <Loader2 size={18} className="animate-spin text-[var(--text-secondary)]" />
        )}
      </SectionCard>

      <SectionCard
        title="Server Monitoring"
        description="Per-VPS health, last checks, and key metric summaries."
      >
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" />
            Loading monitored servers...
          </div>
        ) : servers.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No active monitored servers yet.
          </p>
        ) : (
          <div className="space-y-2">
            {servers.map((server) => (
              <div
                key={server.serverId}
                className="rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {server.name} ({server.host})
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Last check: {formatDate(server.lastCheckAt)}
                    </p>
                    {server.blockingReasons.length > 0 && (
                      <p className="mt-1 text-xs text-yellow-400">
                        {server.blockingReasons.join(' · ')}
                      </p>
                    )}
                  </div>
                  <Badge tone={healthTone(server.monitoringStatus)}>{server.monitoringStatus}</Badge>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-4 xl:grid-cols-6">
                  <div>CPU: {formatMetric(server.metrics.cpuPercent, '%')}</div>
                  <div>RAM: {formatMetric(server.metrics.memoryPercent, '%')}</div>
                  <div>Disk: {formatMetric(server.metrics.diskPercent, '%')}</div>
                  <div>Uptime: {formatMetric(server.metrics.uptimeSeconds, 's')}</div>
                  <div>RX: {formatMetric(server.metrics.networkRxBytesPerSec, ' B/s')}</div>
                  <div>TX: {formatMetric(server.metrics.networkTxBytesPerSec, ' B/s')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Project Monitoring"
        description="Health linked to deployments and CI activity."
      >
        {projects.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No project monitoring data available.
          </p>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => (
              <div
                key={project.projectId}
                className="rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Link
                    href={`/projects/${project.projectId}`}
                    className="text-sm font-semibold text-[var(--text-primary)] hover:underline"
                  >
                    {project.name}
                  </Link>
                  <Badge tone={healthTone(project.health)}>{project.health}</Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)] md:grid-cols-4">
                  <div>Linked VPS: {project.linkedServers}</div>
                  <div>Failed (7d): {project.failedDeployments7d}</div>
                  <div>Success rate (7d): {project.successRate7d ?? '—'}%</div>
                  <div>Last deploy: {formatDate(project.latestDeploymentAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Deployment Monitoring"
        description="Global deployment status trends and recent execution timeline."
      >
        {!deployments ? (
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" />
            Loading deployment monitoring...
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
              {[
                { label: 'Total', value: deployments.stats.total },
                { label: 'Running', value: deployments.stats.running },
                { label: 'Succeeded', value: deployments.stats.succeeded },
                { label: 'Failed', value: deployments.stats.failed },
                { label: 'Canceled', value: deployments.stats.canceled },
                {
                  label: 'Success 7d',
                  value:
                    deployments.stats.successRate7d === null
                      ? '—'
                      : `${deployments.stats.successRate7d}%`,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-[var(--border)] bg-[var(--hover)] px-3 py-2"
                >
                  <p className="text-xs text-[var(--text-secondary)]">{item.label}</p>
                  <p className="text-lg font-semibold text-[var(--text-primary)]">
                    {String(item.value)}
                  </p>
                </div>
              ))}
            </div>
            {deployments.recent.slice(0, 6).map((deployment) => (
              <div
                key={deployment.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--hover)] px-3 py-2 text-sm"
              >
                <p className="font-medium text-[var(--text-primary)]">
                  {deployment.project.name} · {deployment.environment.name}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {deployment.status} · {deployment.server.name} ({deployment.server.host}) ·{' '}
                  {formatDate(deployment.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Alerts"
        description="Warning/critical events from Alertmanager or derived platform checks."
      >
        {!alerts ? (
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" />
            Loading alerts...
          </div>
        ) : alerts.items.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-300">
            <Activity size={15} />
            No active alerts.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warning">
                <AlertTriangle size={11} />
                Warning: {alerts.warning}
              </Badge>
              <Badge tone="error">
                <ShieldAlert size={11} />
                Critical: {alerts.critical}
              </Badge>
              <Badge tone="default">
                <BarChart3 size={11} />
                Source: {alerts.source}
              </Badge>
            </div>
            {alerts.items.slice(0, 20).map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--hover)] px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{item.summary}</p>
                  <Badge tone={item.severity === 'critical' ? 'error' : item.severity === 'warning' ? 'warning' : 'default'}>
                    {item.severity}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  {item.status} · {formatDate(item.startsAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {criticalServers > 0 && (
        <Alert tone="warning">
          <div className="flex items-center gap-2">
            <Server size={14} />
            {criticalServers} server(s) are currently in critical monitoring state.
          </div>
        </Alert>
      )}
    </div>
  );
}
