'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  Boxes,
  Layers,
  Loader2,
  Rocket,
  Settings,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/hooks/auth/use-auth';
import { useProject } from '@/hooks/projects/use-projects';
import { useProjectServices } from '@/hooks/projects/use-project-services';
import { useProjectEnvironments } from '@/hooks/projects/use-project-environments';
import { useProjectMembers } from '@/hooks/projects/use-project-members';
import { useConfirm } from '@/contexts/confirm-context';
import { PageHeader } from '@/components/layout/page-header';
import { ProjectEnvironmentsTab } from '@/components/projects/project-environments-tab';
import { ProjectDeploymentsTab } from '@/components/projects/project-deployments-tab';
import { ProjectMonitoringTab } from '@/components/projects/project-monitoring-tab';
import { useProjectDeployments } from '@/hooks/projects/use-project-deployments';
import { ServicesList } from '@/components/projects/tabs/service/services-list';
import { AddServiceWizard } from '@/components/projects/add-service-wizard';
import { DeployDialog } from '@/components/deployments/deploy-dialog';
import { ProjectMembersTab } from '@/components/projects/project-members-tab';
import { getApiErrorMessage } from '@/lib/api';
import { projectsService } from '@/services/projects.service';

type Tab = 'services' | 'deployments' | 'environments' | 'monitoring' | 'settings';

const TAB_VALUES: Tab[] = ['services', 'deployments', 'environments', 'monitoring', 'settings'];

function parseTab(value: string | null): Tab | null {
  if (!value) return null;
  if (TAB_VALUES.includes(value as Tab)) return value as Tab;
  return null;
}

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default function ProjectDetailPage({ params }: ProjectPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAdmin } = useAuth();
  const { project, loading, error, refresh } = useProject(id);
  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get('tab')) ?? 'services');

  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deployOpen, setDeployOpen] = useState(false);
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | undefined>(undefined);
  const [selectedEnvId, setSelectedEnvId] = useState<string | undefined>(undefined);

  const members = useProjectMembers({ projectId: id, isAdmin, refreshProject: refresh });
  const servicesQuery = useProjectServices(id);
  const environmentsQuery = useProjectEnvironments(id);
  const deploymentsQuery = useProjectDeployments(id);
  const environments = environmentsQuery.data ?? [];
  const confirm = useConfirm();

  useEffect(() => {
    const requestedTab = parseTab(searchParams.get('tab'));
    if (requestedTab) {
      setTab(requestedTab);
    }
  }, [searchParams]);

  const replaceProjectQuery = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) { next.delete(key); return; }
      next.set(key, value);
    });
    const query = next.toString();
    router.replace(query ? `/projects/${id}?${query}` : `/projects/${id}`);
  };

  const handleTabChange = (nextTab: Tab) => {
    setTab(nextTab);
    replaceProjectQuery({ tab: nextTab, dialog: null });
  };

  const handleDeployCreated = () => {
    setTab('services');
    replaceProjectQuery({ tab: 'services' });
    void servicesQuery.refetch();
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete "${project?.name}"?`,
      description: 'This action cannot be undone.',
      confirmLabel: 'Delete project',
      variant: 'danger',
    });
    if (!ok) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await projectsService.remove(id);
      router.push('/projects');
    } catch (err) {
      setDeleteError(getApiErrorMessage(err));
      setDeleteLoading(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={24} className="animate-spin text-[var(--text-secondary)]" />
    </div>
  );

  if (error || !project) return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-300">
      {error ?? 'Project not found.'}
      <div className="mt-3">
        <Link href="/projects" className="text-xs text-red-300 underline">Back to Projects</Link>
      </div>
    </div>
  );

  const currentMember = project.members.find((m) => m.user.id === user?.id);
  const isOwner = isAdmin || currentMember?.role === 'OWNER';

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'services',     label: 'Services',        icon: Boxes },
    { id: 'deployments',  label: 'Deployments',     icon: Rocket },
    { id: 'environments', label: 'Environments',    icon: Layers },
    { id: 'monitoring',   label: 'Monitoring',      icon: Activity },
    { id: 'settings',     label: 'Members & Access', icon: Settings },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Projects"
        title={project.name}
        description={project.description ?? 'No description'}
        actions={
          <>
            <Link href="/projects"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">
              <ArrowLeft size={15} /> Projects
            </Link>
            {/* « Add service » est contextuel à l'onglet Services (cf. ServicesList) —
                on ne le duplique pas dans le header global. */}
            <button type="button" onClick={() => setDeployOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90">
              <Rocket size={15} /> Deploy
            </button>
          </>
        }
      />

      {/* Status badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--hover)] px-2.5 py-1 text-xs text-[var(--text-muted)]">
          {environments.length} environment{environments.length !== 1 ? 's' : ''}
        </span>
        {currentMember && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--hover)] px-2.5 py-1 text-xs text-[var(--text-muted)]">
            {currentMember.role}
          </span>
        )}
      </div>

      {deleteError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span>{deleteError}</span>
          <button type="button" onClick={() => setDeleteError(null)}
            className="shrink-0 rounded-lg border border-red-500/30 px-2 py-0.5 text-xs hover:bg-red-500/20">
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs nav */}
      <div className="border-b border-[var(--border)]">
        <nav className="flex flex-wrap gap-1">
          {tabs.map(({ id: tabId, label, icon: Icon }) => (
            <button key={tabId} onClick={() => handleTabChange(tabId)}
              className={clsx(
                'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition',
                tab === tabId
                  ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              )}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab panels */}
      {tab === 'services' && (
        <ServicesList
          projectId={id}
          services={servicesQuery.data ?? []}
          onAddService={() => setAddServiceOpen(true)}
        />
      )}

      {tab === 'deployments' && (
        <ProjectDeploymentsTab
          deployments={deploymentsQuery.deployments}
          loading={deploymentsQuery.loading}
          error={deploymentsQuery.error}
          projectId={id}
          onRefresh={() => void deploymentsQuery.refresh()}
        />
      )}

      {tab === 'environments' && (
        <ProjectEnvironmentsTab
          projectId={id}
          onChanged={() => void refresh()}
        />
      )}

      {tab === 'monitoring' && <ProjectMonitoringTab projectId={id} />}

      {tab === 'settings' && (
        <ProjectMembersTab
          project={project}
          isOwner={isOwner}
          isAdmin={isAdmin}
          currentUserId={user?.id}
          addMemberOpen={members.addMemberOpen}
          setAddMemberOpen={members.setAddMemberOpen}
          teams={members.teams}
          selectedTeamId={members.selectedTeamId}
          setSelectedTeamId={members.setSelectedTeamId}
          addTeamLoading={members.addTeamLoading}
          addTeamSuccess={members.addTeamSuccess}
          addTeamError={members.addTeamError}
          onAddMember={members.handleAddMember}
          onRemoveMember={members.handleRemoveMember}
          onAddTeam={members.handleAddTeam}
          onDeleteProject={isOwner ? handleDelete : undefined}
          deleteLoading={deleteLoading}
        />
      )}

      <AddServiceWizard
        projectId={id}
        open={addServiceOpen}
        onClose={() => setAddServiceOpen(false)}
        onCreated={() => { setAddServiceOpen(false); void servicesQuery.refetch(); }}
      />

      <DeployDialog
        open={deployOpen}
        projectId={id}
        services={servicesQuery.data ?? []}
        initialServiceId={selectedServiceId}
        initialEnvironmentId={selectedEnvId}
        onClose={() => { setDeployOpen(false); setSelectedServiceId(undefined); setSelectedEnvId(undefined); }}
        onCreated={handleDeployCreated}
      />
    </div>
  );
}
