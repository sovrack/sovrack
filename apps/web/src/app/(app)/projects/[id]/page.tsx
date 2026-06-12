'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  BarChart2,
  Container,
  Layers,
  Loader2,
  Rocket,
  Settings,
  Settings2,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/hooks/auth/use-auth';
import { useProject } from '@/hooks/projects/use-projects';
import { useProjectDeployments } from '@/hooks/projects/use-project-deployments';
import { useProjectSource } from '@/hooks/projects/use-project-source';
import { useProjectMembers } from '@/hooks/projects/use-project-members';
import { PageHeader } from '@/components/layout/page-header';
import { ProjectDeploymentsTab } from '@/components/projects/project-deployments-tab';
import { ConfigurationTab } from '@/components/projects/project-build-tab';
import { ProjectBuildSetupDialog } from '@/components/projects/project-build-setup-dialog';
import { DeployDialog } from '@/components/deployments/deploy-dialog';
import { ProjectMembersTab } from '@/components/projects/project-members-tab';
import { ProjectOverview } from '@/components/projects/project-overview';
import { ProjectSourceSetupDialog } from '@/components/projects/project-source-setup-dialog';
import { ContainersTab } from '@/components/projects/tabs/containers/containers-tab';
import { MonitoringTab } from '@/components/projects/tabs/monitoring/monitoring-tab';
import { getApiErrorMessage } from '@/lib/api';
import { projectsService } from '@/services/projects.service';
import { environmentsService } from '@/services/environments.service';
import type { Environment } from '@/types/environment';
import type { GitlabSourceType } from '@/types/project';

type Tab =
  | 'overview'
  | 'services'
  | 'environments'
  | 'deployments'
  | 'containers'
  | 'monitoring'
  | 'settings';

const TAB_VALUES: Tab[] = [
  'overview', 'services', 'environments', 'deployments', 'containers', 'monitoring', 'settings',
];

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
  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get('tab')) ?? 'overview');

  const [deleteLoading, setDeleteLoading] = useState(false);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [buildDialogOpen, setBuildDialogOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | undefined>(undefined);
  const [selectedEnvId, setSelectedEnvId] = useState<string | undefined>(undefined);

  const members = useProjectMembers({ projectId: id, isAdmin, refreshProject: refresh });
  const source = useProjectSource({ projectId: id, project, refreshProject: refresh });
  const projectDeployments = useProjectDeployments(id);

  useEffect(() => {
    environmentsService.getAll(id).then(setEnvironments).catch(() => setEnvironments([]));
  }, [id]);

  useEffect(() => {
    const requestedTab = parseTab(searchParams.get('tab'));
    const dialog = searchParams.get('dialog');
    if (requestedTab) {
      setTab(requestedTab);
    } else if (dialog === 'source-setup' || dialog === 'build-setup') {
      setTab('services');
    }
    setSourceDialogOpen(dialog === 'source-setup');
    setBuildDialogOpen(dialog === 'build-setup');
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

  const openSourceSetupDialog = () => {
    setTab('services'); setSourceDialogOpen(true); setBuildDialogOpen(false);
    replaceProjectQuery({ tab: 'services', dialog: 'source-setup' });
  };

  const openBuildSetupDialog = () => {
    setTab('services'); setBuildDialogOpen(true); setSourceDialogOpen(false);
    replaceProjectQuery({ tab: 'services', dialog: 'build-setup' });
  };

  const closeSourceDialog = () => { setSourceDialogOpen(false); replaceProjectQuery({ dialog: null }); };
  const closeBuildDialog  = () => { setBuildDialogOpen(false);  replaceProjectQuery({ dialog: null }); };

  const handleSourceNext = async () => { await refresh(); openBuildSetupDialog(); };
  const handleBuildDone  = async () => {
    await refresh(); setBuildDialogOpen(false);
    replaceProjectQuery({ tab: 'services', dialog: null });
  };

  const handleTabChange = (nextTab: Tab) => {
    setTab(nextTab);
    replaceProjectQuery({ tab: nextTab, dialog: null });
  };

  const handleDeployCreated = () => {
    setTab('deployments');
    replaceProjectQuery({ tab: 'deployments' });
    projectDeployments.refresh();
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${project?.name}"? This action cannot be undone.`)) return;
    setDeleteLoading(true);
    try {
      await projectsService.remove(id);
      router.push('/projects');
    } catch (deleteError) {
      alert(getApiErrorMessage(deleteError));
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
    { id: 'overview',       label: 'Overview',       icon: Rocket },
    { id: 'services',       label: 'Services',       icon: Settings2 },
    { id: 'environments',   label: 'Environments',  icon: Layers },
    { id: 'deployments',    label: 'Deployments',    icon: Activity },
    { id: 'containers',     label: 'Containers',     icon: Container },
    { id: 'monitoring',     label: 'Monitoring',     icon: BarChart2 },
    { id: 'settings',       label: 'Settings',       icon: Settings },
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
            <button type="button" onClick={() => setDeployOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90">
              <Rocket size={15} /> Deploy
            </button>
          </>
        }
      />

      {/* Status badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={clsx(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
          source.sourceConfig
            ? 'border-green-500/20 bg-green-500/10 text-green-400'
            : 'border-amber-500/20 bg-amber-500/10 text-amber-400',
        )}>
          {source.sourceConfig ? '● Source connected' : '○ Source not connected'}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--hover)] px-2.5 py-1 text-xs text-[var(--text-muted)]">
          {environments.length} environment{environments.length !== 1 ? 's' : ''}
        </span>
        {currentMember && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--hover)] px-2.5 py-1 text-xs text-[var(--text-muted)]">
            {currentMember.role}
          </span>
        )}
      </div>

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
      {tab === 'overview' && (
        <ProjectOverview
          project={project}
          lastDeployment={projectDeployments.deployments[0] ?? null}
          sourceConfig={source.sourceConfig}
          environments={environments}
          onRollbackDone={() => void projectDeployments.refresh()}
          onTabChange={(t) => setTab(t as Tab)}
          onOpenBuild={() => { setTab('services'); openBuildSetupDialog(); }}
          onDeploy={() => { setSelectedServiceId(undefined); setDeployOpen(true); }}
        />
      )}

      {tab === 'services' && (
        <ConfigurationTab
          projectId={id}
          project={project}
          isAdmin={isAdmin}
          isOwner={isOwner}
          sourceType={source.sourceConfig?.sourceType ?? null}
          hasEnvironment={environments.length > 0}
          source={source}
          scope="application"
          onDeploy={() => { setSelectedServiceId(undefined); setDeployOpen(true); }}
          onDeployService={(svcId) => { setSelectedServiceId(svcId); setDeployOpen(true); }}
          onOpenSourceSetupDialog={openSourceSetupDialog}
        />
      )}

      {tab === 'environments' && (
        <ConfigurationTab
          projectId={id}
          project={project}
          isAdmin={isAdmin}
          isOwner={isOwner}
          sourceType={source.sourceConfig?.sourceType ?? null}
          hasEnvironment={environments.length > 0}
          source={source}
          scope="environments"
          onDeploy={() => { setSelectedServiceId(undefined); setDeployOpen(true); }}
          onDeployService={(svcId) => { setSelectedServiceId(svcId); setDeployOpen(true); }}
          onOpenSourceSetupDialog={openSourceSetupDialog}
        />
      )}

      {tab === 'deployments' && (
        <ProjectDeploymentsTab
          projectId={id}
          deployments={projectDeployments.deployments}
          loading={projectDeployments.loading}
          error={projectDeployments.error}
          onCreateClick={() => setDeployOpen(true)}
          onRefresh={() => void projectDeployments.refresh()}
        />
      )}

      {tab === 'containers' && (
        <ContainersTab projectId={id} />
      )}

      {tab === 'monitoring' && (
        <MonitoringTab projectId={id} />
      )}

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

      <ProjectSourceSetupDialog
        open={sourceDialogOpen}
        projectId={id}
        initialGitlabUrl={source.sourceConfig?.gitlabUrl ?? null}
        initialDefaultBranch={source.sourceConfig?.defaultBranch ?? null}
        initialProviderId={source.sourceConfig?.providerId ?? null}
        initialSourceType={(source.sourceConfig?.sourceType ?? null) as GitlabSourceType | null}
        initialProjectId={source.sourceConfig?.gitlabId ?? null}
        initialGroupId={source.sourceConfig?.gitlabGroupId ?? null}
        onClose={closeSourceDialog}
        onNext={() => handleSourceNext()}
      />

      <ProjectBuildSetupDialog
        open={buildDialogOpen}
        projectId={id}
        onClose={closeBuildDialog}
        onDone={handleBuildDone}
      />

      <DeployDialog
        open={deployOpen}
        projectId={id}
        services={[]}
        initialServiceId={selectedServiceId}
        initialEnvironmentId={selectedEnvId}
        onClose={() => { setDeployOpen(false); setSelectedServiceId(undefined); setSelectedEnvId(undefined); }}
        onCreated={handleDeployCreated}
      />
    </div>
  );
}
