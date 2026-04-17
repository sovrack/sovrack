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
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Déploiements récents</h3>
          <p className="mt-1 text-xs text-slate-500">Projet: {projectId}</p>
        </div>
        <Link
          href="/deployments/new"
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          Nouveau déploiement
        </Link>
      </div>

      {loading && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <Loader2 size={14} className="animate-spin" /> Chargement des déploiements...
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && deployments.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          Aucun déploiement trouvé pour ce projet.
        </div>
      )}

      <div className="space-y-2">
        {deployments.slice(0, 8).map((deployment) => (
          <div
            key={deployment.id}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{deployment.branch}</p>
                <p className="text-xs text-slate-500">{deployment.id}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {deployment.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
