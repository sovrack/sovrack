'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { ProjectGitlabTab } from '@/components/projects/project-gitlab-tab';
import { ProjectMembersTab } from '@/components/projects/project-members-tab';
import { ProjectOverview } from '@/components/projects/project-overview';
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
type ProjectPageProps = {
  params: Promise<{ id: string }>;
};
export default function ProjectDetailPage({ params }: ProjectPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { project, loading, error, refresh } = useProject(id);
  const [tab, setTab] = useState<Tab>('overview');
  const [deleteLoading, setDeleteLoading] = useState(false);
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
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-indigo-500" />
      </div>
    );
  }
  if (error || !project) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
        {error ?? 'Project not found.'}
        <div className="mt-3">
          <Link href="/projects" className="text-xs text-red-600 underline">
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
    { id: 'gitlab', label: 'GitLab', icon: GitBranch },
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
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700"
            >
              <ArrowLeft size={15} />
              Projects
            </Link>
            {isOwner && (
              <>
                <Link
                  href={`/projects/${id}/edit`}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <Settings size={15} /> Edit
                </Link>
                <button
                  onClick={() => void handleDelete()}
                  disabled={deleteLoading}
                  className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 shadow-sm transition hover:bg-red-50 disabled:opacity-50"
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
          <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', gitlab.gitlabConfig ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
            {gitlab.gitlabConfig ? 'GitLab Connected' : 'GitLab Not Connected'}
          </span>
          {currentMember && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
              You are {currentMember.role}
            </span>
          )}
        </div>
      </SectionCard>
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="flex flex-wrap gap-1">
          {tabs.map(({ id: tabId, label, icon: Icon }) => (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className={clsx('flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition', tab === tabId ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700')}
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
      {tab === 'gitlab' && <ProjectGitlabTab isOwner={isOwner} gitlab={gitlab} />}
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
    </div>
  );
}
