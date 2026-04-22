'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Boxes,
  GitBranch,
  Hammer,
  Loader2,
  Rocket,
  Settings,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/hooks/useAuth';
import { useProject } from '@/hooks/useProjects';
import { useProjectDeployments } from '@/hooks/useProjectDeployments';
import { useProjectGitlab } from '@/hooks/useProjectGitlab';
import { useProjectMembers } from '@/hooks/useProjectMembers';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { ProjectConfigsTab } from '@/components/projects/project-configs-tab';
import { ProjectDeploymentsTab } from '@/components/projects/project-deployments-tab';
import { ProjectEnvironmentsTab } from '@/components/projects/project-environments-tab';
import { ProjectBuildTab } from '@/components/projects/project-build-tab';
import { ProjectBuildSetupDialog } from '@/components/projects/project-build-setup-dialog';
import { ProjectGitlabTab } from '@/components/projects/project-gitlab-tab';
import { ProjectMembersTab } from '@/components/projects/project-members-tab';
import { ProjectOverview } from '@/components/projects/project-overview';
import { ProjectSourceSetupDialog } from '@/components/projects/project-source-setup-dialog';
import { getApiErrorMessage } from '@/lib/api';
import { projectsService } from '@/services/projects.service';

type Tab =
  | 'overview'
  | 'members'
  | 'gitlab'
  | 'environments'
  | 'configs'
  | 'deployments'
  | 'build';

const TAB_VALUES: Tab[] = [
  'overview',
  'members',
  'gitlab',
  'environments',
  'configs',
  'deployments',
  'build',
];

function parseTab(value: string | null): Tab | null {
  if (!value) {
    return null;
  }

  if (TAB_VALUES.includes(value as Tab)) {
    return value as Tab;
  }

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
  const [buildDialogOpen, setBuildDialogOpen] = useState(false);

  const members = useProjectMembers({
    projectId: id,
    isAdmin,
    refreshProject: refresh,
  });
  const gitlab = useProjectGitlab({
    projectId: id,
    project,
    refreshProject: refresh,
  });
  const projectDeployments = useProjectDeployments(id);

  useEffect(() => {
    const requestedTab = parseTab(searchParams.get('tab'));
    const dialog = searchParams.get('dialog');

    if (requestedTab) {
      setTab(requestedTab);
    } else if (dialog === 'source-setup') {
      setTab('gitlab');
    } else if (dialog === 'build-setup') {
      setTab('build');
    }

    setSourceDialogOpen(dialog === 'source-setup');
    setBuildDialogOpen(dialog === 'build-setup');
  }, [searchParams]);

  const replaceProjectQuery = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        next.delete(key);
        return;
      }

      next.set(key, value);
    });

    const query = next.toString();
    router.replace(query ? `/projects/${id}?${query}` : `/projects/${id}`);
  };

  const openSourceSetupDialog = () => {
    setTab('gitlab');
    setSourceDialogOpen(true);
    setBuildDialogOpen(false);
    replaceProjectQuery({ tab: 'gitlab', dialog: 'source-setup' });
  };

  const openBuildSetupDialog = () => {
    setTab('build');
    setBuildDialogOpen(true);
    setSourceDialogOpen(false);
    replaceProjectQuery({ tab: 'build', dialog: 'build-setup' });
  };

  const closeSourceDialog = () => {
    setSourceDialogOpen(false);
    replaceProjectQuery({ dialog: null });
  };

  const closeBuildDialog = () => {
    setBuildDialogOpen(false);
    replaceProjectQuery({ dialog: null });
  };

  const handleSourceNext = async () => {
    await refresh();
    openBuildSetupDialog();
  };

  const handleBuildDone = async () => {
    await refresh();
    setBuildDialogOpen(false);
    replaceProjectQuery({ tab: 'build', dialog: null });
  };

  const handleTabChange = (nextTab: Tab) => {
    setTab(nextTab);
    replaceProjectQuery({ tab: nextTab, dialog: null });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[var(--text-secondary)]" />
      </div>
    );
  }
  if (error || !project) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-300">
        {error ?? 'Project not found.'}
        <div className="mt-3">
          <Link href="/projects" className="text-xs text-red-300 underline">
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }
  const currentMember = project.members.find((member) => member.user.id === user?.id);
  const isOwner = isAdmin || currentMember?.role === 'OWNER';
  const handleDelete = async () => {
    if (!confirm(`Delete "${project.name}"? This action cannot be undone.`)) {
      return;
    }
    setDeleteLoading(true);
    try {
      await projectsService.remove(id);
      router.push('/projects');
    } catch (deleteError) {
      alert(getApiErrorMessage(deleteError));
      setDeleteLoading(false);
    }
  };
  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: Rocket },
    { id: 'members', label: `Members (${project.members.length})`, icon: Users },
    { id: 'gitlab', label: 'Source', icon: GitBranch },
    { id: 'environments', label: 'Environments', icon: Boxes },
    { id: 'configs', label: 'Configs', icon: Wrench },
    { id: 'deployments', label: 'Deployments', icon: Settings },
    { id: 'build', label: 'Build', icon: Hammer },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Projects"
        title={project.name}
        description={project.description ?? 'No description'}
        actions={
          <>
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              <ArrowLeft size={15} />
              Projects
            </Link>
            {isOwner && (
              <>
                <button
                  type="button"
                  onClick={openSourceSetupDialog}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-card)]/10"
                >
                  <GitBranch size={15} /> Source setup
                </button>
                <button
                  type="button"
                  onClick={openBuildSetupDialog}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-card)]/10"
                >
                  <Hammer size={15} /> Build setup
                </button>
                <Link
                  href={`/projects/${id}/edit`}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-card)]/10"
                >
                  <Settings size={15} /> Edit
                </Link>
                <button
                  onClick={() => void handleDelete()}
                  disabled={deleteLoading}
                  className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                >
                  {deleteLoading ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  Delete
                </button>
              </>
            )}
          </>
        }
      />
      <SectionCard contentClassName="py-4">
        <div className="flex flex-wrap gap-2">
          <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', gitlab.gitlabConfig ? 'bg-green-500/15 text-green-300' : 'bg-[var(--bg-card)]/10 text-[var(--text-primary)]')}>
            {gitlab.gitlabConfig ? 'Source Connected' : 'Source Not Connected'}
          </span>
          {currentMember && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--text-primary)]/15 px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
              You are {currentMember.role}
            </span>
          )}
        </div>
      </SectionCard>
      <div className="border-b border-[var(--border)]">
        <nav className="flex flex-wrap gap-1">
          {tabs.map(({ id: tabId, label, icon: Icon }) => (
            <button
              key={tabId}
              onClick={() => handleTabChange(tabId)}
              className={clsx('flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition', tab === tabId ? 'border-[var(--border)] text-[var(--text-secondary)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]')}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </nav>
      </div>
      {tab === 'overview' && <ProjectOverview project={project} />}
      {tab === 'members' && (
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
        />
      )}
      {tab === 'gitlab' && (
        <ProjectGitlabTab
          isOwner={isOwner}
          gitlab={gitlab}
          onOpenSourceSetupDialog={openSourceSetupDialog}
        />
      )}
      {tab === 'environments' && <ProjectEnvironmentsTab projectId={id} />}
      {tab === 'configs' && <ProjectConfigsTab projectId={id} />}
      {tab === 'deployments' && (
        <ProjectDeploymentsTab
          projectId={id}
          deployments={projectDeployments.deployments}
          loading={projectDeployments.loading}
          error={projectDeployments.error}
        />
      )}
      {tab === 'build' && <ProjectBuildTab projectId={id} isAdmin={isAdmin} />}

      <ProjectSourceSetupDialog
        open={sourceDialogOpen}
        projectId={id}
        initialGitlabUrl={project.gitlabUrl}
        initialDefaultBranch={project.branch}
        initialProviderId={gitlab.gitlabConfig?.providerId ?? null}
        initialSourceType={gitlab.gitlabConfig?.sourceType ?? null}
        initialProjectId={gitlab.gitlabConfig?.gitlabId ?? null}
        initialGroupId={gitlab.gitlabConfig?.gitlabGroupId ?? null}
        onClose={closeSourceDialog}
        onNext={() => handleSourceNext()}
      />

      <ProjectBuildSetupDialog
        open={buildDialogOpen}
        projectId={id}
        onClose={closeBuildDialog}
        onDone={handleBuildDone}
      />
    </div>
  );
}
