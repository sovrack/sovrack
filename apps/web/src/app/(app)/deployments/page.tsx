'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, CheckCircle2, Plus, Rocket } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deploymentsService } from '@/services/deployments.service';
import { projectsService } from '@/services/projects.service';
import { getApiErrorMessage } from '@/lib/api';
import { DeploymentCreateDialog } from '@/components/deployments/deployment-create-dialog';
import { DeploymentLogsDialog } from '@/components/projects/tabs/runs/deployment-logs-dialog';
import { DeploymentContainerDialog } from '@/components/deployments/deployment-container-dialog';
import { ProjectDeploymentsTab } from '@/components/projects/project-deployments-tab';
import { PageHeader } from '@/components/layout/page-header';
import { useAuth } from '@/hooks/auth/use-auth';
import type { Deployment } from '@/types/deployment';

/**
 * Centre de déploiements (tous projets). Réutilise EXACTEMENT l'UI de l'onglet
 * Deployments d'un projet (ProjectDeploymentsTab) en mode global : mêmes lignes
 * (statut, logs en dialog, Open app, rollback, redeploy) + le nom du projet par
 * ligne. Au-dessus : KPIs + « New deployment ».
 */
export default function DeploymentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['deployments-page'],
    queryFn: async () => {
      const [deploymentList, projectList] = await Promise.all([
        deploymentsService.getAll(),
        projectsService.getAll(),
      ]);
      return { deployments: deploymentList, projects: projectList };
    },
    refetchInterval: 10_000,
  });

  const deployments: Deployment[] = data?.deployments ?? [];
  const error = queryError ? getApiErrorMessage(queryError) : null;
  const canCreate =
    isAdmin ||
    (data?.projects ?? []).some(
      (p) => p.currentUserProjectRole === 'OWNER' || p.currentUserProjectRole === 'DEVELOPER',
    );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['deployments-page'] });
    await refetch();
  };

  useEffect(() => {
    if (searchParams.get('dialog') === 'create-deployment') setCreateDialogOpen(true);
  }, [searchParams]);

  // Deep-links from other pages (dashboard, top-nav, service page) open dialogs
  // here instead of navigating to a dedicated deployment page.
  const logsId = searchParams.get('logs');
  const containerId = searchParams.get('container');
  const closeDeepLink = (key: 'logs' | 'container') => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(key);
    const q = next.toString();
    router.replace(q ? `/deployments?${q}` : '/deployments');
  };

  const clearDialog = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('dialog');
    const q = next.toString();
    router.replace(q ? `/deployments?${q}` : '/deployments');
  };
  const handleClose = () => { setCreateDialogOpen(false); clearDialog(); };
  const handleCreated = async () => { setCreateDialogOpen(false); clearDialog(); await refresh(); };

  const running = deployments.filter((d) => d.status === 'RUNNING').length;
  const success = deployments.filter((d) => d.status === 'SUCCESS').length;
  const failed = deployments.filter((d) => d.status === 'FAILED').length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Deployment Center"
        title="Deployments"
        description="Tous les déploiements, tous projets confondus."
        actions={
          canCreate ? (
            <button type="button" onClick={() => setCreateDialogOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] shadow transition hover:opacity-90">
              <Plus size={16} /> New deployment
            </button>
          ) : undefined
        }
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

      <DeploymentCreateDialog
        open={createDialogOpen}
        onClose={handleClose}
        onCreated={handleCreated}
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
