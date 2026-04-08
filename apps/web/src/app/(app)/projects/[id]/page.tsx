'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  GitBranch,
  Users,
  Rocket,
  Settings,
  Trash2,
  CheckCircle,
  XCircle,
  Plus,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useProject } from '@/hooks/useProjects';
import { useAuth } from '@/hooks/useAuth';
import { MembersList } from '@/components/projects/members-list';
import { AddMemberModal } from '@/components/projects/add-member-modal';
import { projectsService } from '@/services/projects.service';
import { getApiErrorMessage } from '@/lib/api';
import clsx from 'clsx';

type Tab = 'overview' | 'members' | 'gitlab';

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default function ProjectDetailPage({ params }: ProjectPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { project, loading, error, refresh } = useProject(id);
  const [tab, setTab] = useState<Tab>('overview');
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  const currentMember = project.members.find((m) => m.user.id === user?.id);
  const isOwner = isAdmin || currentMember?.role === 'OWNER';
  const isGitlabConnected = Boolean(project.gitlabConfig);

  const handleAddMember = async (email: string, role: 'OWNER' | 'MEMBER') => {
    await projectsService.addMember(id, { email, role });
    await refresh();
  };

  const handleRemoveMember = async (memberId: string) => {
    await projectsService.removeMember(id, memberId);
    await refresh();
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Delete "${project.name}"? This action cannot be undone.`,
      )
    )
      return;
    setDeleteLoading(true);
    try {
      await projectsService.remove(id);
      router.push('/projects');
    } catch (err) {
      alert(getApiErrorMessage(err));
      setDeleteLoading(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: Rocket },
    { id: 'members', label: `Members (${project.members.length})`, icon: Users },
    { id: 'gitlab', label: 'GitLab', icon: GitBranch },
  ];

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700"
        >
          <ArrowLeft size={15} />
          Projects
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500 text-lg font-bold text-white shadow">
              {project.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
              <p className="text-sm text-slate-500">
                {project.description ?? 'No description'}
              </p>
            </div>
          </div>

          {/* Actions */}
          {isOwner && (
            <div className="flex items-center gap-2">
              <Link
                href={`/projects/${id}/edit`}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <Settings size={15} />
                Edit
              </Link>
              <button
                onClick={() => void handleDelete()}
                disabled={deleteLoading}
                className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 shadow-sm transition hover:bg-red-50 disabled:opacity-50"
              >
                {deleteLoading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Trash2 size={15} />
                )}
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-2">
        <span
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
            isGitlabConnected
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-slate-100 text-slate-600',
          )}
        >
          {isGitlabConnected ? <CheckCircle size={12} /> : <XCircle size={12} />}
          {isGitlabConnected ? 'GitLab Connected' : 'GitLab Not Connected'}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
          <GitBranch size={12} />
          {project.defaultBranch}
        </span>
        {currentMember && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
            <Users size={12} />
            You are {currentMember.role}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-1">
          {tabs.map(({ id: tabId, label, icon: Icon }) => (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className={clsx(
                'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition',
                tab === tabId
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Deployments
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {project._count?.deployments ?? 0}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Members
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {project.members.length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Environments
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {project._count?.environments ?? 0}
            </p>
          </div>

          {/* GitLab link */}
          {project.gitlabUrl && (
            <div className="sm:col-span-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Repository
              </p>
              <a
                href={project.gitlabUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                {project.gitlabUrl}
                <ExternalLink size={14} />
              </a>
            </div>
          )}
        </div>
      )}

      {tab === 'members' && (
        <div className="space-y-4">
          {isOwner && (
            <div className="flex justify-end">
              <button
                onClick={() => setAddMemberOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-indigo-700"
              >
                <Plus size={15} />
                Add Member
              </button>
            </div>
          )}
          <MembersList
            members={project.members}
            canManage={isOwner}
            currentUserId={user?.id}
            onRemove={handleRemoveMember}
          />
          <AddMemberModal
            open={addMemberOpen}
            onClose={() => setAddMemberOpen(false)}
            onAdd={handleAddMember}
          />
        </div>
      )}

      {tab === 'gitlab' && (
        <div className="space-y-4">
          {isGitlabConnected ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                GitLab Configuration
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs text-slate-400">Repository URL</p>
                  <p className="font-mono font-medium text-slate-800 break-all">
                    {project.gitlabConfig?.gitlabUrl}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Project ID</p>
                  <p className="font-mono font-medium text-slate-800">
                    {project.gitlabConfig?.gitlabId}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Default Branch</p>
                  <p className="font-mono font-medium text-slate-800">
                    {project.gitlabConfig?.defaultBranch}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center">
              <GitBranch size={32} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-500">
                No GitLab repository connected
              </p>
              <p className="mt-1 text-xs text-slate-400">
                GitLab connection UI coming in a future update.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
