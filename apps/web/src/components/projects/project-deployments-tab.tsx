import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import type { Deployment } from '@/types/deployment';

type ProjectDeploymentsTabProps = {
  deployments: Deployment[];
  loading: boolean;
  error: string | null;
  projectId: string;
};

export function ProjectDeploymentsTab({
  deployments,
  loading,
  error,
  projectId,
}: ProjectDeploymentsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Déploiements récents</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Projet: {projectId}</p>
        </div>
        <Link
          href="/deployments?dialog=create-deployment"
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90"
        >
          Nouveau déploiement
        </Link>
      </div>

      {loading && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-3 text-sm text-[var(--text-primary)]">
          <Loader2 size={14} className="animate-spin" /> Chargement des déploiements...
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && deployments.length === 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-6 text-sm text-[var(--text-secondary)]">
          Aucun déploiement trouvé pour ce projet.
        </div>
      )}

      <div className="space-y-2">
        {deployments.slice(0, 8).map((deployment) => (
          <div
            key={deployment.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{deployment.branch}</p>
                <p className="text-xs text-[var(--text-secondary)]">{deployment.id}</p>
              </div>
              <span className="rounded-full bg-[var(--bg-card)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)]">
                {deployment.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
