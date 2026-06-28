'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ChevronRight,
  Cpu,
  ExternalLink,
  Gauge,
  Layers,
  MemoryStick,
  Wrench,
} from 'lucide-react';
import { monitoringService } from '@/features/monitoring';
import { useProjectDeployments } from '@/features/projects/api/use-project-deployments';
import { useProjectEnvironments } from '@/features/projects/api/use-project-environments';
import { ServiceMetricsChart } from '@/features/projects/components/tabs/service/service-metrics-chart';
import type { Service } from '@/features/projects/types/service';
import type { Deployment } from '@/features/deployments/types';

/** Live CPU/mémoire d'un service (docker stats du conteneur du dernier déploiement). */
function ServiceLiveStats({ deploymentId }: { deploymentId: string }) {
  const { data } = useQuery({
    queryKey: ['container-info', deploymentId],
    queryFn: () => monitoringService.getContainerInfo(deploymentId, 0),
    refetchInterval: 10_000,
  });
  if (!data?.stats) {
    return <span className="font-mono text-xs text-[var(--text-muted)]">—</span>;
  }
  return (
    <span className="flex items-center gap-3 font-mono text-xs text-[var(--text-secondary)]">
      <span className="flex items-center gap-1">
        <Cpu size={11} /> {data.stats.cpuPercent}
      </span>
      <span className="flex items-center gap-1">
        <MemoryStick size={11} /> {data.stats.memPercent}
      </span>
    </span>
  );
}

/** Pastille de statut Prometheus / Grafana. */
function StackPill({
  label,
  configured,
  reachable,
}: {
  label: string;
  configured: boolean;
  reachable: boolean;
}) {
  const tone = !configured
    ? 'text-[var(--text-muted)]'
    : reachable
      ? 'text-green-400'
      : 'text-red-400';
  return (
    <span className={`flex items-center gap-1 text-xs ${tone}`}>
      <Gauge size={12} /> {label}{' '}
      {!configured ? '·non installé' : reachable ? '·up' : '·down'}
    </span>
  );
}

/**
 * Onglet « Monitoring » du PROJET = tableau de bord complet, SANS clic :
 * bandeau résumé (services live + statut Prometheus/Grafana + Ouvrir Grafana),
 * puis par service son état + live CPU/mém + la COURBE inline (historique +
 * marqueurs de déploiement). Dégradation gracieuse si Prometheus absent.
 */
export function ProjectMonitoringTab({
  projectId,
  services,
}: {
  projectId: string;
  services: Service[];
}) {
  const { deployments, loading } = useProjectDeployments(projectId);
  const { data: environments } = useProjectEnvironments(projectId);
  const { data: overview } = useQuery({
    queryKey: ['monitoring-overview', projectId],
    queryFn: () => monitoringService.getOverview(),
    refetchInterval: 30_000,
    retry: false,
  });
  const [envId, setEnvId] = useState<string>('all');

  // Dernier déploiement par service (filtré par environnement).
  const latestByService = new Map<string, Deployment>();
  for (const d of [...(deployments ?? [])]
    .filter((d) => envId === 'all' || d.environment?.id === envId)
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )) {
    if (d.serviceId && !latestByService.has(d.serviceId)) {
      latestByService.set(d.serviceId, d);
    }
  }

  const liveCount = services.filter(
    (s) => (latestByService.get(s.id)?.containers?.length ?? 0) > 0,
  ).length;

  const resolveServiceEnvId = (s: Service): string | null => {
    if (envId !== 'all') {
      return s.envLinks?.find((l) => l.environmentId === envId)?.id ?? null;
    }
    return latestByService.get(s.id)?.serviceEnvId ?? s.envLinks?.[0]?.id ?? null;
  };

  return (
    <div className="space-y-4">
      {/* Bandeau résumé : compteurs + statut stack + Grafana/install */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-[var(--text-secondary)]" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {services.length} service{services.length !== 1 ? 's' : ''}
          </span>
          <span className="text-xs text-green-400">· {liveCount} live</span>
        </div>
        {overview && (
          <>
            <StackPill
              label="Prometheus"
              configured={overview.prometheus.configured}
              reachable={overview.prometheus.reachable}
            />
            <StackPill
              label="Grafana"
              configured={overview.grafana.configured}
              reachable={overview.grafana.reachable}
            />
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {(environments?.length ?? 0) > 0 && (
            <label className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
              <Layers size={12} />
              <select
                value={envId}
                onChange={(e) => setEnvId(e.target.value)}
                className="bg-transparent text-[var(--text-primary)] outline-none"
                aria-label="Filtrer par environnement"
              >
                <option value="all">Tous les environnements</option>
                {environments?.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {overview?.grafana.reachable && overview.grafana.url ? (
            <a
              href={overview.grafana.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90"
            >
              <ExternalLink size={12} /> Ouvrir Grafana
            </a>
          ) : overview && !overview.prometheus.configured ? (
            <Link
              href="/automation"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--hover)]"
            >
              <Wrench size={12} /> Installer le monitoring
            </Link>
          ) : null}
        </div>
      </div>

      {services.length === 0 ? (
        <p className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center text-sm text-[var(--text-muted)]">
          Aucun service à monitorer. Ajoutez un service au projet.
        </p>
      ) : (
        services.map((s) => {
          const latest = latestByService.get(s.id);
          const serving = (latest?.containers?.length ?? 0) > 0;
          const serviceEnvId = resolveServiceEnvId(s);
          const serviceDeployments = (deployments ?? []).filter(
            (d) => d.serviceId === s.id,
          );
          return (
            <div
              key={s.id}
              className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]"
            >
              <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${serving ? 'animate-pulse bg-green-400' : 'bg-[var(--text-muted)]'}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {s.name}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {serving ? 'Live' : latest ? 'Inactif' : 'Jamais déployé'}
                    {s.type ? ` · ${s.type}` : ''}
                  </p>
                </div>
                {serving && latest ? (
                  <ServiceLiveStats deploymentId={latest.id} />
                ) : null}
                <Link
                  href={`/projects/${projectId}/services/${s.id}`}
                  className="flex items-center gap-1 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
                  title="Détail du service"
                >
                  Détail <ChevronRight size={12} />
                </Link>
              </div>
              {/* Courbe inline (historique + marqueurs de déploiement) */}
              {serviceEnvId && (
                <div className="px-2 py-2">
                  <ServiceMetricsChart
                    serviceEnvId={serviceEnvId}
                    deployments={serviceDeployments}
                  />
                </div>
              )}
            </div>
          );
        })
      )}

      {loading && (
        <p className="text-center text-xs text-[var(--text-muted)]">chargement…</p>
      )}
    </div>
  );
}
