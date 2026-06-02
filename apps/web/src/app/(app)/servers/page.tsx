'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Server as ServerIcon } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ServerStatusBadge } from '@/components/servers/server-status-badges';
import { useServers } from '@/hooks/servers/use-servers';
import type { ServerStatus } from '@/types/server';

const STATUS_FILTERS: { value: 'ALL' | ServerStatus; label: string }[] = [
  { value: 'ALL', label: 'Tous' },
  { value: 'PREPARED', label: 'Prêts' },
  { value: 'SSH_VALIDATED', label: 'SSH validés' },
  { value: 'NEW', label: 'Nouveaux' },
  { value: 'PREPARATION_FAILED', label: 'En échec' },
];

export default function ServersDevPage() {
  const [statusFilter, setStatusFilter] = useState<'ALL' | ServerStatus>('ALL');
  const { data: servers = [], isLoading, error } = useServers();

  const filteredServers = useMemo(() => {
    if (statusFilter === 'ALL') return servers;
    return servers.filter((server) => server.status === statusFilter);
  }, [servers, statusFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Infrastructure"
        title="Serveurs disponibles"
        description="Vue lecture seule des VPS gérés par la plateforme."
      />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Erreur lors du chargement des serveurs.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStatusFilter(filter.value)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              statusFilter === filter.value
                ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-app)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--hover)]'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--text-secondary)]">Chargement…</p>
      ) : filteredServers.length === 0 ? (
        <EmptyState
          icon={ServerIcon}
          title="Aucun serveur"
          description={
            statusFilter === 'ALL'
              ? "Aucun serveur n'est encore enregistré sur la plateforme."
              : 'Aucun serveur ne correspond au filtre sélectionné.'
          }
        />
      ) : (
        <SectionCard
          title={`${filteredServers.length} serveur${filteredServers.length > 1 ? 's' : ''}`}
          description="Cliquez sur un serveur pour voir le détail."
          contentClassName="space-y-2"
        >
          {filteredServers.map((server) => (
            <Link
              key={server.id}
              href={`/servers/${server.id}`}
              className="block rounded-lg border border-[var(--border)] bg-[var(--hover)] px-4 py-3 transition hover:border-[var(--text-secondary)]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    {server.name}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)] font-mono">
                    {server.host}:{server.port} · {server.username}@
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {server.hasDocker && <Badge tone="success" size="sm">Docker</Badge>}
                  {server.hasRunner && <Badge tone="default" size="sm">Runner</Badge>}
                  <ServerStatusBadge status={server.status} />
                </div>
              </div>
            </Link>
          ))}
        </SectionCard>
      )}
    </div>
  );
}
