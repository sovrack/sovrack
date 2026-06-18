'use client';

import Link from 'next/link';
import { Activity, Boxes, GitPullRequestArrow, Layers, Rocket } from 'lucide-react';
import { DeploymentStatusBadge } from '@/components/deployments/deployment-status-badge';
import type { Deployment } from '@/types/deployment';
import type { Service } from '@/types/service';

type EnvLike = { id: string; name: string };

/**
 * Onglet « Overview » du projet : vue d'ensemble en lecture seule (compteurs +
 * derniers déploiements + accès rapides). Responsabilité : répondre « où en est
 * ce projet ? » d'un coup d'œil, sans dupliquer la gestion (faite par les autres
 * onglets).
 */
export function ProjectOverviewTab({
  projectId,
  services,
  environments,
  deployments,
  onNavigate,
}: {
  projectId: string;
  services: Service[];
  environments: EnvLike[];
  deployments: Deployment[];
  onNavigate: (tab: 'services' | 'deployments' | 'pipelines' | 'environments' | 'monitoring') => void;
}) {
  const recent = [...deployments]
    .sort((a, b) => new Date(b.startedAt ?? 0).getTime() - new Date(a.startedAt ?? 0).getTime())
    .slice(0, 5);

  const stats = [
    { label: 'Services', value: services.length, icon: Boxes, tab: 'services' as const },
    { label: 'Environnements', value: environments.length, icon: Layers, tab: 'environments' as const },
    { label: 'Déploiements', value: deployments.length, icon: Rocket, tab: 'deployments' as const },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, tab }) => (
          <button key={label} type="button" onClick={() => onNavigate(tab)}
            className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 text-left transition hover:border-[var(--text-muted)]">
            <div>
              <p className="text-xs text-[var(--text-muted)]">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
            </div>
            <Icon size={20} className="text-[var(--text-secondary)]" />
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Derniers déploiements</p>
          <button type="button" onClick={() => onNavigate('deployments')}
            className="text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">Tout voir</button>
        </div>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-muted)]">Aucun déploiement pour l’instant.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {recent.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-[var(--text-primary)]">{d.service?.name ?? 'Service'}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {d.environment?.name ?? '—'}
                    {d.startedAt ? ` · ${new Date(d.startedAt).toLocaleString()}` : ''}
                  </p>
                </div>
                <DeploymentStatusBadge status={d.status} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={`/projects/${projectId}?tab=pipelines`} onClick={() => onNavigate('pipelines')}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">
          <GitPullRequestArrow size={14} /> Pipelines
        </Link>
        <Link href={`/projects/${projectId}?tab=monitoring`} onClick={() => onNavigate('monitoring')}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">
          <Activity size={14} /> Monitoring
        </Link>
      </div>
    </div>
  );
}
