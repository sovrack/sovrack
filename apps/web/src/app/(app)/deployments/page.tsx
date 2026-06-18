'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, CheckCircle2, Rocket } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deploymentsService } from '@/services/deployments.service';
import { getApiErrorMessage } from '@/lib/api';
import { DeploymentLogsDialog } from '@/components/projects/tabs/runs/deployment-logs-dialog';
import { DeploymentContainerDialog } from '@/components/deployments/deployment-container-dialog';
import { ProjectDeploymentsTab } from '@/components/projects/project-deployments-tab';
import { PageHeader } from '@/components/layout/page-header';
import type { Deployment } from '@/types/deployment';

/**
 * Centre de déploiements (tous projets) — vue de CONSULTATION.
 * On NE déploie PAS depuis ici (un déploiement se définit dans un contexte
 * service × env) : on déploie depuis le projet/service. Ici on consulte le
 * statut, on ouvre les logs/conteneur en dialog, on rollback/redeploy par ligne.
 */
export default function DeploymentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const { data, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['deployments-page'],
    queryFn: () => deploymentsService.getAll(),
    refetchInterval: 10_000,
  });

  const deployments: Deployment[] = data ?? [];
  const error = queryError ? getApiErrorMessage(queryError) : null;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['deployments-page'] });
    await refetch();
  };

  // Deep-links depuis d'autres pages (dashboard, top-nav, page service) :
  // ouvrent un dialog ici au lieu de naviguer vers une page dédiée.
  const logsId = searchParams.get('logs');
  const containerId = searchParams.get('container');
  const closeDeepLink = (key: 'logs' | 'container') => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(key);
    const q = next.toString();
    router.replace(q ? `/deployments?${q}` : '/deployments');
  };

  const running = deployments.filter((d) => d.status === 'RUNNING').length;
  const success = deployments.filter((d) => d.status === 'SUCCESS').length;
  const failed = deployments.filter((d) => d.status === 'FAILED').length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Deployment Center"
        title="Deployments"
        description="Tous les déploiements, tous projets confondus."
      />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: deployments.length, icon: <Rocket size={14} />, color: '' },
          { label: 'Success', value: success, icon: <CheckCircle2 size={14} />, color: 'text-green-400' },
          { label: 'Running / Failed', value: running + failed, icon: <Activity size={14} />, color: running > 0 ? 'text-blue-400' : failed > 0 ? 'text-red-400' : '' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">{stat.icon} {stat.label}</div>
            <p className={`mt-2 text-3xl font-bold ${stat.color || 'text-[var(--text-primary)]'}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Même UI que l'onglet Deployments d'un projet (mode global). */}
      <ProjectDeploymentsTab
        deployments={deployments}
        loading={loading}
        error={error}
        onRefresh={() => void refresh()}
      />

      {/* Deep-linked dialogs (?logs=<id> / ?container=<id>) */}
      <DeploymentLogsDialog
        open={!!logsId}
        deploymentId={logsId}
        onClose={() => closeDeepLink('logs')}
      />
      <DeploymentContainerDialog
        open={!!containerId}
        deploymentId={containerId}
        onClose={() => closeDeepLink('container')}
      />
    </div>
  );
}
