'use client';

import { BarChart2, ExternalLink, LineChart } from 'lucide-react';

type Props = { projectId: string };

export function MonitoringTab({ projectId: _projectId }: Props) {
  const tools: {
    name: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    bg: string;
    border: string;
    docsHref: string;
  }[] = [
    {
      name: 'Grafana',
      description: 'View your metrics, logs and alerts dashboards. Connect your Prometheus, Loki or InfluxDB data sources for full monitoring.',
      icon: <LineChart size={20} />,
      color: 'text-orange-400',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/20',
      docsHref: 'https://grafana.com/docs/',
    },
    {
      name: 'Prometheus',
      description: 'Collect and store metrics from your services. Configure alerting rules and integrate Grafana as the visualization frontend.',
      icon: <BarChart2 size={20} />,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      docsHref: 'https://prometheus.io/docs/',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">Monitoring</p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Integrate Grafana and Prometheus on your VPS for full observability.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((tool) => (
          <div key={tool.name} className={`rounded-2xl border ${tool.border} ${tool.bg} p-5 space-y-3`}>
            <div className="flex items-center gap-3">
              <span className={tool.color}>{tool.icon}</span>
              <p className={`text-base font-bold ${tool.color}`}>{tool.name}</p>
            </div>
            <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{tool.description}</p>
            <a href={tool.docsHref} target="_blank" rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 text-xs font-semibold ${tool.color} hover:underline`}>
              Documentation <ExternalLink size={10} />
            </a>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-3">
        <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Recommended stack</p>
        <div className="space-y-2 text-xs text-[var(--text-secondary)]">
          {[
            ['Metrics exporter', 'node_exporter sur chaque VPS → Prometheus → Grafana'],
            ['Container metrics', 'cAdvisor → Prometheus → Grafana dashboard Docker'],
            ['Logs', 'Promtail → Loki → Grafana Explore'],
            ['Alerting', 'Prometheus Alertmanager → Slack / PagerDuty'],
          ].map(([label, value]) => (
            <div key={label} className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-muted)]" />
              <span><strong className="text-[var(--text-primary)]">{label}</strong> — {value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
