'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle,
  Clock,
  Container,
  FilterX,
  GitBranch,
  Hammer,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { deploymentsService } from '@/services/deployments.service';
import { getApiErrorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Pagination } from '@/components/ui/pagination';
import { SectionCard } from '@/components/layout/section-card';
import { usePagination } from '@/hooks/usePagination';
import type { Deployment } from '@/types/deployment';

type StatusFilter = 'all' | Deployment['status'];

function statusBadge(status: Deployment['status']) {
  switch (status) {
    case 'SUCCESS':
      return <Badge tone="success" size="sm"><CheckCircle size={10} /> Success</Badge>;
    case 'FAILED':
      return <Badge tone="error" size="sm"><XCircle size={10} /> Failed</Badge>;
    case 'RUNNING':
      return <Badge tone="info" size="sm"><Loader2 size={10} className="animate-spin" /> Running</Badge>;
    case 'PENDING':
      return <Badge tone="default" size="sm"><Clock size={10} /> Pending</Badge>;
    case 'CANCELED':
      return <Badge tone="default" size="sm"><XCircle size={10} /> Canceled</Badge>;
    default:
      return <Badge tone="default" size="sm">{status}</Badge>;
  }
}

function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt || !finishedAt) return '—';
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function formatRelative(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

export default function BuildsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await deploymentsService.getAll();
      // Seuls les déploiements avec une image Docker = builds réels
      setDeployments(all.filter((d) => d.dockerImage));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return deployments;
    return deployments.filter((d) => d.status === statusFilter);
  }, [deployments, statusFilter]);

  const { page, totalPages, paged, goToPage } = usePagination(filtered, { pageSize: 10 });

  const hasFilters = statusFilter !== 'all';

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Tous les statuts' },
    { value: 'SUCCESS', label: 'Success' },
    { value: 'RUNNING', label: 'En cours' },
    { value: 'FAILED', label: 'Échoué' },
    { value: 'PENDING', label: 'En attente' },
    { value: 'CANCELED', label: 'Annulé' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CI/CD"
        title="Builds"
        description="Historique des images Docker construites et déployées via GitLab CI."
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}
            onClick={() => void load()}
            disabled={loading}
          >
            Rafraîchir
          </Button>
        }
      />

      {/* Statistiques */}
      <SectionCard contentClassName="p-0">
        <div className="grid grid-cols-2 gap-3 border-b border-[var(--border)] p-5 sm:grid-cols-4">
          {[
            { label: 'Total', value: deployments.length },
            { label: 'Success', value: deployments.filter((d) => d.status === 'SUCCESS').length },
            { label: 'Échoués', value: deployments.filter((d) => d.status === 'FAILED').length },
            { label: 'En cours', value: deployments.filter((d) => d.status === 'RUNNING' || d.status === 'PENDING').length },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
              <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
              <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">{value}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Filtres */}
      <SectionCard title="Filtrer" description="Par statut de build." contentClassName="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
              Statut
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="h-10 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <Button
            variant="secondary"
            icon={<FilterX size={14} />}
            onClick={() => setStatusFilter('all')}
            disabled={!hasFilters}
          >
            Réinitialiser
          </Button>
        </div>
      </SectionCard>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--text-secondary)]" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <SectionCard>
          <EmptyState
            icon={Hammer}
            title="Aucun build trouvé"
            description={hasFilters ? 'Aucun build ne correspond aux filtres actifs.' : 'Les builds apparaîtront ici une fois que des déploiements avec image Docker auront été lancés.'}
          />
        </SectionCard>
      )}

      {!loading && paged.length > 0 && (
        <div className="space-y-3">
          {paged.map((deployment) => (
            <div
              key={deployment.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--border)]/70"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                {/* Infos principales */}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {(deployment.project as { name?: string } | undefined)?.name ?? 'Projet'}
                    </span>
                    {statusBadge(deployment.status)}
                    <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                      <GitBranch size={12} /> {deployment.branch}
                    </span>
                  </div>

                  {deployment.dockerImage && (
                    <p className="mt-1.5 flex items-center gap-1.5 break-all font-mono text-xs text-[var(--text-secondary)]">
                      <Container size={12} className="shrink-0" />
                      {deployment.dockerImage}
                    </p>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                    <span>
                      {(deployment.environment as { name?: string } | undefined)?.name ?? '—'}
                    </span>
                    <span>
                      Durée : {formatDuration(
                        deployment.startedAt ?? null,
                        deployment.finishedAt ?? null,
                      )}
                    </span>
                    <span>{formatRelative(deployment.createdAt)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/deployments/${deployment.id}`}
                    className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--hover)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--border)]"
                  >
                    Voir les logs
                  </Link>
                </div>
              </div>
            </div>
          ))}

          <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} className="mt-2" />
        </div>
      )}
    </div>
  );
}
