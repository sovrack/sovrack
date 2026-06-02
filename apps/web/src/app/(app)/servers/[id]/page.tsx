'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Server as ServerIcon } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { InstalledToolsList } from '@/components/servers/installed-tools-list';
import { ServerStatusBadge } from '@/components/servers/server-status-badges';
import { useInstalledTools, useServer } from '@/hooks/servers/use-servers';

type Props = {
  params: Promise<{ id: string }>;
};

export default function ServerDevDetailsPage({ params }: Props) {
  const [id, setId] = useState<string>('');

  useEffect(() => {
    void params.then(({ id: serverId }) => setId(serverId));
  }, [params]);

  const { data: server, isLoading, error } = useServer(id);
  const { data: tools = [] } = useInstalledTools(id);

  if (!id || isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Chargement…" />
      </div>
    );
  }

  if (error || !server) {
    return (
      <div className="space-y-6">
        <PageHeader title="Serveur introuvable" />
        <EmptyState
          icon={ServerIcon}
          title="Serveur introuvable"
          description="Ce serveur n'existe pas ou vous n'y avez pas accès."
          action={
            <Link
              href="/servers"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--hover)]"
            >
              <ArrowLeft size={14} />
              Retour à la liste
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/servers"
          className="rounded-lg border border-[var(--border)] p-2 text-[var(--text-secondary)] hover:bg-[var(--hover)]"
        >
          <ArrowLeft size={14} />
        </Link>
        <PageHeader
          eyebrow="Serveur"
          title={server.name}
          description={`${server.host}:${server.port} · ${server.username}@`}
          actions={<ServerStatusBadge status={server.status} />}
        />
      </div>

      <SectionCard title="Informations" description="Configuration du serveur cible.">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase text-[var(--text-muted)]">Host</dt>
            <dd className="mt-1 font-mono text-[var(--text-primary)]">{server.host}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-[var(--text-muted)]">Port SSH</dt>
            <dd className="mt-1 font-mono text-[var(--text-primary)]">{server.port}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-[var(--text-muted)]">Utilisateur</dt>
            <dd className="mt-1 font-mono text-[var(--text-primary)]">{server.username}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-[var(--text-muted)]">Connexion</dt>
            <dd className="mt-1 text-[var(--text-primary)]">{server.connectionMode}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-[var(--text-muted)]">Vérifié</dt>
            <dd className="mt-1">
              {server.isVerified ? (
                <Badge tone="success" size="sm">Oui</Badge>
              ) : (
                <Badge tone="warning" size="sm">Non</Badge>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-[var(--text-muted)]">Rôle infra</dt>
            <dd className="mt-1 text-[var(--text-primary)]">{server.infraRole ?? '—'}</dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title="Outils installés" description="Détectés via la préparation Ansible.">
        {tools.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Aucun outil détecté. Le serveur n&apos;a pas encore été préparé.
          </p>
        ) : (
          <InstalledToolsList tools={tools} />
        )}
      </SectionCard>
    </div>
  );
}
