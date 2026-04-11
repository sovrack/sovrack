'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Settings,
  Trash2,
  Users,
} from 'lucide-react';
import clsx from 'clsx';
import { useProject } from '@/hooks/useProjects';
import { useAuth } from '@/hooks/useAuth';
import { AddMemberModal } from '@/components/projects/add-member-modal';
import { MembersList } from '@/components/projects/members-list';
import { getApiErrorMessage } from '@/lib/api';
import { projectsService } from '@/services/projects.service';
import type {
  ConnectGitlabPayload,
  GitlabBranch,
  GitlabConfig,
  GitlabPipeline,
  GitlabRepo,
  GitlabSourceType,
  ProjectRole,
} from '@/types/project';

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

  const [gitlabConfig, setGitlabConfig] = useState<GitlabConfig | null>(null);
  const [branches, setBranches] = useState<GitlabBranch[]>([]);
  const [pipelines, setPipelines] = useState<GitlabPipeline[]>([]);
  const [repos, setRepos] = useState<GitlabRepo[]>([]);
  const [gitlabLoading, setGitlabLoading] = useState(false);
  const [gitlabError, setGitlabError] = useState<string | null>(null);
  const [gitlabSubmitting, setGitlabSubmitting] = useState(false);
  const [pipelineSubmitting, setPipelineSubmitting] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const [gitlabUrl, setGitlabUrl] = useState('');
  const [gitlabToken, setGitlabToken] = useState('');
  const [gitlabProjectId, setGitlabProjectId] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [selectedBranch, setSelectedBranch] = useState('main');
  const [sourceType, setSourceType] = useState<GitlabSourceType>('REPO');
  const [gitlabGroupId, setGitlabGroupId] = useState('');
  const [deployTokenUsername, setDeployTokenUsername] = useState('');
  const [deployTokenValue, setDeployTokenValue] = useState('');
  const [registryUrl, setRegistryUrl] = useState('');

  const loadGitlabData = useCallback(async () => {
    setGitlabLoading(true);
    setGitlabError(null);

    try {
      const config = await projectsService.getGitlabConfig(id);
      setGitlabConfig(config);
      setSourceType(config.sourceType);
      setGitlabUrl(config.gitlabUrl);
      setGitlabProjectId(config.gitlabId ? String(config.gitlabId) : '');
      setGitlabGroupId(config.gitlabGroupId ? String(config.gitlabGroupId) : '');
      setDefaultBranch(config.defaultBranch || 'main');
      setSelectedBranch(config.defaultBranch || 'main');
      setDeployTokenUsername(config.deployTokenUsername ?? '');
      setRegistryUrl(config.registryUrl ?? '');

      if (config.sourceType === 'GROUP') {
        const nextRepos = await projectsService.getRepos(id);
        setRepos(nextRepos);
        setBranches([]);
        setPipelines([]);
      } else {
        const [nextBranches, nextPipelines] = await Promise.all([
          projectsService.getBranches(id),
          projectsService.getPipelines(id),
        ]);
        setBranches(nextBranches);
        setPipelines(nextPipelines);
        setRepos([]);
      }
    } catch (fetchError) {
      const message = getApiErrorMessage(fetchError);
      const isMissingConfig =
        message.includes('Configuration GitLab non trouvée') ||
        message.includes('404');

      if (isMissingConfig) {
        setGitlabConfig(null);
        setBranches([]);
        setPipelines([]);
        setRepos([]);
        setGitlabError(null);
      } else {
        setGitlabConfig(null);
        setBranches([]);
        setPipelines([]);
        setRepos([]);
        setGitlabError(message);
      }
    } finally {
      setGitlabLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!project) {
      return;
    }

    setGitlabUrl(project.gitlabUrl ?? '');
    setGitlabProjectId(project.gitlabId ? String(project.gitlabId) : '');
    setDefaultBranch(project.branch ?? 'main');
    setSelectedBranch(project.branch ?? 'main');
  }, [project]);

  useEffect(() => {
    void loadGitlabData();
  }, [loadGitlabData]);

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
  const isGitlabConnected = Boolean(gitlabConfig);

  const handleAddMember = async (email: string, role: ProjectRole) => {
    await projectsService.addMember(id, { email, role });
    await refresh();
  };

  const handleRemoveMember = async (userId: string) => {
    await projectsService.removeMember(id, userId);
    await refresh();
  };

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

  const handleConnectGitlab = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGitlabError(null);

    let parsedRepoId: number | undefined;
    let parsedGroupId: number | undefined;

    if (sourceType === 'REPO') {
      const repoId = Number(gitlabProjectId);
      if (!Number.isFinite(repoId) || repoId <= 0) {
        setGitlabError('GitLab Project ID invalide.');
        return;
      }
      parsedRepoId = repoId;
    } else {
      const groupId = Number(gitlabGroupId);
      if (!Number.isFinite(groupId) || groupId <= 0) {
        setGitlabError('GitLab Group ID invalide.');
        return;
      }
      parsedGroupId = groupId;
    }

    const payload: ConnectGitlabPayload = {
      gitlabUrl: gitlabUrl.trim(),
      gitlabToken: gitlabToken.trim(),
      defaultBranch: defaultBranch.trim() || 'main',
      sourceType,
      gitlabId: parsedRepoId,
      gitlabGroupId: parsedGroupId,
      deployTokenUsername: deployTokenUsername.trim() || undefined,
      deployTokenValue: deployTokenValue.trim() || undefined,
      registryUrl: registryUrl.trim() || undefined,
    };

    setGitlabSubmitting(true);
    try {
      await projectsService.connectGitlab(id, payload);
      setGitlabToken('');
      setDeployTokenValue('');
      await refresh();
      await loadGitlabData();
    } catch (connectError) {
      setGitlabError(getApiErrorMessage(connectError));
    } finally {
      setGitlabSubmitting(false);
    }
  };

  const handleTriggerPipeline = async () => {
    if (sourceType === 'GROUP') {
      return;
    }
    setPipelineSubmitting(true);
    setGitlabError(null);

    try {
      await projectsService.triggerPipeline(id, selectedBranch);
      await loadGitlabData();
    } catch (triggerError) {
      setGitlabError(getApiErrorMessage(triggerError));
    } finally {
      setPipelineSubmitting(false);
    }
  };

  const handleCopyWebhookSecret = async () => {
    if (!gitlabConfig?.webhookSecret) {
      return;
    }

    try {
      await navigator.clipboard.writeText(gitlabConfig.webhookSecret);
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 1500);
    } catch {
      setCopySuccess(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: Rocket },
    { id: 'members', label: `Members (${project.members.length})`, icon: Users },
    { id: 'gitlab', label: 'GitLab', icon: GitBranch },
  ];

  return (
    <div className="space-y-6">
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

      <div className="flex flex-wrap gap-2">
        <span
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
            isGitlabConnected
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-slate-100 text-slate-600',
          )}
        >
          {isGitlabConnected ? 'GitLab Connected' : 'GitLab Not Connected'}
        </span>
        {gitlabConfig?.sourceType && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            {gitlabConfig.sourceType}
          </span>
        )}
        {currentMember && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
            You are {currentMember.role}
          </span>
        )}
      </div>

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

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              Default Branch
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{project.branch}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Container Port
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900">:{project.port}</p>
          </div>
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
          {gitlabError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {gitlabError}
            </div>
          )}

          {!isGitlabConnected && isOwner && (
            <form
              onSubmit={handleConnectGitlab}
              className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
            >
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-slate-900">Connect GitLab</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Configure REPO ou GROUP, puis les credentials optionnels du registry.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                    Source Type
                  </label>
                  <select
                    value={sourceType}
                    onChange={(event) =>
                      setSourceType(event.target.value as GitlabSourceType)
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="REPO">REPO</option>
                    <option value="GROUP">GROUP</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                    GitLab URL
                  </label>
                  <input
                    type="url"
                    required
                    value={gitlabUrl}
                    onChange={(event) => setGitlabUrl(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                {sourceType === 'REPO' ? (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                      Project ID
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={gitlabProjectId}
                      onChange={(event) => setGitlabProjectId(event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                      Group ID
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={gitlabGroupId}
                      onChange={(event) => setGitlabGroupId(event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                    Default Branch
                  </label>
                  <input
                    type="text"
                    value={defaultBranch}
                    onChange={(event) => setDefaultBranch(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                    Access Token
                  </label>
                  <input
                    type="password"
                    required
                    value={gitlabToken}
                    onChange={(event) => setGitlabToken(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                    Deploy Token Username
                  </label>
                  <input
                    type="text"
                    value={deployTokenUsername}
                    onChange={(event) => setDeployTokenUsername(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                    Deploy Token Value
                  </label>
                  <input
                    type="password"
                    value={deployTokenValue}
                    onChange={(event) => setDeployTokenValue(event.target.value)}
                    placeholder="***"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                    Registry URL
                  </label>
                  <input
                    type="text"
                    value={registryUrl}
                    onChange={(event) => setRegistryUrl(event.target.value)}
                    placeholder="registry.gitlab.example.com"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={gitlabSubmitting}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {gitlabSubmitting && <Loader2 size={15} className="animate-spin" />}
                Save GitLab Configuration
              </button>
            </form>
          )}

          {!isGitlabConnected && !isOwner && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center">
              <GitBranch size={32} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-500">
                No GitLab source connected
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Only owner or admin can configure GitLab.
              </p>
            </div>
          )}

          {isGitlabConnected && gitlabConfig && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    GitLab Configuration
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Source type: {gitlabConfig.sourceType}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadGitlabData()}
                  disabled={gitlabLoading}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw
                    size={15}
                    className={gitlabLoading ? 'animate-spin' : ''}
                  />
                  Refresh
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Repository URL
                  </p>
                  <a
                    href={gitlabConfig.gitlabUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-2 break-all text-sm font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    {gitlabConfig.gitlabUrl}
                    <ExternalLink size={14} />
                  </a>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Source
                  </p>
                  <p className="mt-2 font-mono text-lg font-semibold text-slate-900">
                    {gitlabConfig.sourceType}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {gitlabConfig.sourceType === 'REPO'
                      ? `Project ID: ${gitlabConfig.gitlabId ?? '-'}`
                      : `Group ID: ${gitlabConfig.gitlabGroupId ?? '-'}`}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Webhook Secret
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      readOnly
                      value={gitlabConfig.webhookSecret ?? ''}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCopyWebhookSecret()}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  {copySuccess && (
                    <p className="mt-1 text-xs font-medium text-emerald-600">
                      Webhook secret copied
                    </p>
                  )}
                </div>
              </div>

              {gitlabConfig.sourceType === 'GROUP' ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900">
                      Group Repositories
                    </h4>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {repos.length} repos
                    </span>
                  </div>
                  <div className="space-y-2">
                    {repos.length === 0 && (
                      <p className="text-sm text-slate-500">
                        No repositories found in this group.
                      </p>
                    )}
                    {repos.slice(0, 10).map((repo) => (
                      <div
                        key={repo.id}
                        className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {repo.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {repo.path_with_namespace ?? ''}
                          </p>
                        </div>
                        {repo.web_url && (
                          <a
                            href={repo.web_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
                          >
                            Open
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">Branches</h4>
                        <p className="mt-1 text-xs text-slate-400">
                          Select a branch and trigger a pipeline.
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {branches.length} branches
                      </span>
                    </div>

                    {branches.length > 0 ? (
                      <>
                        <select
                          value={selectedBranch}
                          onChange={(event) => setSelectedBranch(event.target.value)}
                          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                        >
                          {branches.map((branch) => (
                            <option key={branch.name} value={branch.name}>
                              {branch.name}
                              {branch.default ? ' (default)' : ''}
                            </option>
                          ))}
                        </select>

                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => void handleTriggerPipeline()}
                            disabled={pipelineSubmitting || !selectedBranch}
                            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {pipelineSubmitting && (
                              <Loader2 size={15} className="animate-spin" />
                            )}
                            Trigger Pipeline
                          </button>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-slate-500">No branches available yet.</p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">
                          Recent Pipelines
                        </h4>
                        <p className="mt-1 text-xs text-slate-400">
                          Latest GitLab pipeline activity for this project.
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {pipelines.length} entries
                      </span>
                    </div>

                    <div className="space-y-3">
                      {pipelines.length === 0 && (
                        <p className="text-sm text-slate-500">
                          No pipelines found for this project yet.
                        </p>
                      )}
                      {pipelines.slice(0, 6).map((pipeline) => (
                        <div
                          key={pipeline.id}
                          className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                #{pipeline.id}
                              </p>
                              <p className="mt-0.5 font-mono text-xs text-slate-500">
                                {pipeline.ref}
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase text-slate-600">
                              {pipeline.status}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                            <span className="font-mono">{pipeline.sha.slice(0, 8)}</span>
                            {pipeline.web_url && (
                              <a
                                href={pipeline.web_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
                              >
                                Open
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
