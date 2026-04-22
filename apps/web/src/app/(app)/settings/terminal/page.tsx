'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Monitor, RefreshCw, TerminalSquare } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { deploymentsService } from '@/services/deployments.service';
import { getApiErrorMessage } from '@/lib/api';
import type { Deployment } from '@/types/deployment';

export default function TerminalSettingsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await deploymentsService.getAll();
      setDeployments(all);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recent = useMemo(() => deployments.slice(0, 10), [deployments]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Opérations"
        title="Terminal"
        description="Accédez rapidement aux logs de déploiement depuis un point d'entrée terminal central."
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
            onClick={() => void load()}
            disabled={loading}
          >
            Rafraîchir
          </Button>
        }
      />

      {error && <Alert variant="error" title="Erreur" message={error} />}

      <SectionCard
        title="Comment utiliser"
        description="Chaque déploiement ouvre une vue de terminal en direct sur sa page de détail."
      >
        <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
          <li>1. Choisissez un déploiement ci-dessous.</li>
          <li>2. Ouvrez sa page de détail.</li>
          <li>3. Regardez les logs en temps réel dans le panneau terminal.</li>
        </ul>
      </SectionCard>

      <SectionCard
        title="Déploiements Récents"
        description="Accès rapide aux terminaux de déploiement."
      >
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={22} className="animate-spin text-[var(--text-secondary)]" />
          </div>
        ) : recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] px-4 py-8 text-center">
            <TerminalSquare className="mx-auto h-8 w-8 text-[var(--text-secondary)]" />
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Aucun déploiement pour le moment. Lancez-en un pour accéder aux logs du terminal.
            </p>
            <Link
              href="/deployments/new"
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover)]"
            >
              <Monitor size={14} />
              Nouveau déploiement
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((deployment) => (
              <Link
                key={deployment.id}
                href={`/deployments/${deployment.id}`}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 transition hover:bg-[var(--hover)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {deployment.project?.name || 'Déploiement'} - {deployment.environment?.name || 'N/A'}
                  </p>
                  <p className="truncate text-xs text-[var(--text-secondary)]">
                    {new Date(deployment.createdAt).toLocaleString('fr-FR')}
                  </p>
                </div>
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${
                    deployment.status === 'SUCCESS'
                      ? 'bg-green-500/20 text-green-400'
                      : deployment.status === 'FAILED'
                      ? 'bg-red-500/20 text-red-400'
                      : deployment.status === 'RUNNING'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-[var(--border)] text-[var(--text-secondary)]'
                  }`}
                >
                  {deployment.status === 'SUCCESS'
                    ? 'Réussi'
                    : deployment.status === 'FAILED'
                    ? 'Échoué'
                    : deployment.status === 'RUNNING'
                    ? 'En cours'
                    : 'Attente'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
