'use client';

import { useMonitoring } from '@/hooks/monitoring/use-monitoring';
import {
  Activity,
  AlertTriangle,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

function healthTone(value: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN') {
  if (value === 'HEALTHY') return 'success' as const;
  if (value === 'WARNING') return 'warning' as const;
  if (value === 'CRITICAL') return 'error' as const;
  return 'default' as const;
}

function formatMetric(value: number | null, suffix = ''): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}${suffix}`;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export default function MonitoringPage() {
  const { overview, servers, alerts, loading, error, refresh } = useMonitoring();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Monitoring"
        description="Server status, Prometheus and Grafana."
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
            onClick={() => void refresh()}
            disabled={loading}
          >
            Refresh
          </Button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Monitored servers', value: overview?.totalMonitoredServers ?? '—' },
          { label: 'Healthy', value: overview?.healthy ?? '—' },
          { label: 'Warning', value: overview?.warning ?? '—' },
          { label: 'Critical', value: overview?.critical ?? '—' },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3"
          >
            <p className="text-xs font-medium text-[var(--text-muted)]">{item.label}</p>
            <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">{String(item.value)}</p>
          </div>
        ))}
      </div>

      {/* Prometheus + Grafana status */}
      <SectionCard title="Observability services">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            {
              name: 'Prometheus',
              reachable: overview?.prometheus.reachable,
              message: overview?.prometheus.message,
              url: overview?.prometheus.url,
              extra: overview
                ? `${overview.prometheus.upTargets}/${overview.prometheus.totalTargets} targets up`
                : null,
            },
            {
              name: 'Grafana',
              reachable: overview?.grafana.reachable,
              message: overview?.grafana.message,
              url: overview?.grafana.url,
              extra: null,
            },
          ].map((svc) => (
            <div
              key={svc.name}
              className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3"
            >
              <div className="space-y-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{svc.name}</p>
                {loading ? (
                  <Loader2 size={13} className="animate-spin text-[var(--text-muted)]" />
                ) : (
                  <>
                    <Badge tone={svc.reachable ? 'success' : 'error'}>
                      {svc.reachable ? 'Online' : 'Offline'}
                    </Badge>
                    {svc.message && (
                      <p className="text-xs text-[var(--text-secondary)] truncate">{svc.message}</p>
                    )}
                    {svc.extra && (
                      <p className="text-xs text-[var(--text-muted)]">{svc.extra}</p>
                    )}
                  </>
                )}
              </div>
              {svc.url && (
                <a
                  href={svc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                >
                  Ouvrir <ExternalLink size={11} />
                </a>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Servers */}
      <SectionCard
        title="Serveurs"
        description="Health and system metrics per VPS."
      >
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 size={15} className="animate-spin" /> Chargement…
          </div>
        ) : servers.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No monitored servers.</p>
        ) : (
          <div className="space-y-2">
            {servers.map((server) => (
              <div
                key={server.serverId}
                className="rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {server.name}
                      <span className="ml-1.5 font-normal text-[var(--text-muted)]">({server.host})</span>
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Verified: {formatDate(server.lastCheckAt)}
                    </p>
                  </div>
                  <Badge tone={healthTone(server.monitoringStatus)}>{server.monitoringStatus}</Badge>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)] sm:grid-cols-6">
                  <span>CPU {formatMetric(server.metrics.cpuPercent, '%')}</span>
                  <span>RAM {formatMetric(server.metrics.memoryPercent, '%')}</span>
                  <span>Disk {formatMetric(server.metrics.diskPercent, '%')}</span>
                  <span>Uptime {formatMetric(server.metrics.uptimeSeconds, 's')}</span>
                  <span>RX {formatMetric(server.metrics.networkRxBytesPerSec, ' B/s')}</span>
                  <span>TX {formatMetric(server.metrics.networkTxBytesPerSec, ' B/s')}</span>
                </div>

                {server.blockingReasons.length > 0 && (
                  <p className="mt-1.5 text-xs text-amber-400">
                    {server.blockingReasons.join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Alerts */}
      <SectionCard title="Alertes">
        {!alerts ? (
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 size={15} className="animate-spin" /> Chargement…
          </div>
        ) : alerts.items.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-300">
            <Activity size={14} /> No active alerts.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge tone="warning"><AlertTriangle size={11} /> Warning : {alerts.warning}</Badge>
              <Badge tone="error"><ShieldAlert size={11} /> Critical : {alerts.critical}</Badge>
            </div>
            {alerts.items.slice(0, 20).map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--hover)] px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{item.summary}</p>
                  <Badge
                    tone={
                      item.severity === 'critical'
                        ? 'error'
                        : item.severity === 'warning'
                          ? 'warning'
                          : 'default'
                    }
                  >
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
    </div>
  );
}
