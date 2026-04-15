'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Rocket, Loader2 } from 'lucide-react';
import { projectsService } from '@/services/projects.service';
import { environmentsService } from '@/services/environments.service';
import { deploymentsService } from '@/services/deployments.service';
import { useAuth } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/api';
import type {
  ProjectListItem,
  GitlabBranch,
  GitlabConfig,
  GitlabRepo,
} from '@/types/project';
import type { Environment } from '@/types/environment';

export default function NewDeploymentPage() {
  const router = useRouter();
  const { isAdmin } = useAuth();

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [branches, setBranches] = useState<GitlabBranch[]>([]);
  const [groupRepos, setGroupRepos] = useState<GitlabRepo[]>([]);
  const [gitlabConfig, setGitlabConfig] = useState<GitlabConfig | null>(null);

  const [projectId, setProjectId] = useState('');
  const [environmentId, setEnvironmentId] = useState('');
  const [branch, setBranch] = useState('');
  const [selectedRepoId, setSelectedRepoId] = useState('');

  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingEnvs, setLoadingEnvs] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [envError, setEnvError] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [repoError, setRepoError] = useState<string | null>(null);

  // Load projects on mount
  useEffect(() => {
    projectsService.getAll()
      .then((list) => {
        setProjects(list);
        if (list.length > 0) setProjectId(list[0].id);
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoadingProjects(false));
  }, []);

  // Load environments + GitLab config/repositories when project changes
  useEffect(() => {
    if (!projectId) {
      return;
    }

    let isCancelled = false;

    setEnvironments([]);
    setBranches([]);
    setGroupRepos([]);
    setGitlabConfig(null);
    setEnvironmentId('');
    setBranch('');
    setSelectedRepoId('');
    setEnvError(null);
    setBranchError(null);
    setRepoError(null);

    setLoadingEnvs(true);
    environmentsService.getAll(projectId)
      .then((envs) => {
        if (isCancelled) {
          return;
        }
        setEnvironments(envs);
        setEnvError(null);
        if (envs.length > 0) setEnvironmentId(envs[0].id);
      })
      .catch((err) => {
        if (isCancelled) {
          return;
        }
        setEnvError(getApiErrorMessage(err));
      })
      .finally(() => setLoadingEnvs(false));

    projectsService.getGitlabConfig(projectId)
      .then(async (config) => {
        if (isCancelled) {
          return;
        }

        setGitlabConfig(config);

        if (config.sourceType === 'GROUP') {
          setLoadingRepos(true);
          try {
            const repos = await projectsService.getRepos(projectId);
            if (isCancelled) {
              return;
            }
            setGroupRepos(repos);
            setRepoError(null);

            if (repos.length > 0) {
              const firstRepoId = repos[0]?.id;
              setSelectedRepoId(
                Number.isFinite(firstRepoId) ? String(firstRepoId) : '',
              );
            } else {
              setSelectedRepoId('');
              setBranchError(
                'Aucun repository disponible dans ce groupe GitLab.',
              );
            }
          } catch (repoErr) {
            if (isCancelled) {
              return;
            }
            setRepoError(getApiErrorMessage(repoErr));
          } finally {
            if (!isCancelled) {
              setLoadingRepos(false);
            }
          }
          return;
        }

        setLoadingBranches(true);
        projectsService.getBranches(projectId)
          .then((list) => {
            if (isCancelled) {
              return;
            }
            setBranches(list);
            setBranchError(null);
            const def = list.find((b) => b.default);
            setBranch(def?.name ?? list[0]?.name ?? '');
          })
          .catch((err) => {
            if (isCancelled) {
              return;
            }
            // GitLab might not be connected — fallback to project default branch
            const proj = projects.find((p) => p.id === projectId);
            if (proj?.branch) setBranch(proj.branch);
            setBranchError(getApiErrorMessage(err));
          })
          .finally(() => {
            if (!isCancelled) {
              setLoadingBranches(false);
            }
          });
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }
        const proj = projects.find((p) => p.id === projectId);
        if (proj?.branch) {
          setBranch(proj.branch);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [projectId, projects]);

  // Load branches from selected GROUP repository
  useEffect(() => {
    if (!projectId || gitlabConfig?.sourceType !== 'GROUP') {
      return;
    }

    if (!selectedRepoId) {
      setBranches([]);
      setBranch('');
      setBranchError('Sélectionner le repository à déployer.');
      return;
    }

    let isCancelled = false;
    const parsedRepoId = Number(selectedRepoId);
    if (!Number.isInteger(parsedRepoId) || parsedRepoId <= 0) {
      setBranches([]);
      setBranch('');
      setBranchError('Repository GitLab invalide.');
      return;
    }

    setLoadingBranches(true);
    setBranchError(null);
    projectsService
      .getBranches(projectId, parsedRepoId)
      .then((list) => {
        if (isCancelled) {
          return;
        }
        setBranches(list);
        const def = list.find((item) => item.default);
        setBranch(def?.name ?? list[0]?.name ?? '');
      })
      .catch((err) => {
        if (isCancelled) {
          return;
        }
        setBranches([]);
        setBranch('');
        setBranchError(getApiErrorMessage(err));
      })
      .finally(() => {
        if (!isCancelled) {
          setLoadingBranches(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [projectId, selectedRepoId, gitlabConfig?.sourceType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !environmentId) {
      setFormError('Please select a project and environment.');
      return;
    }

    const isGroupDeployment = gitlabConfig?.sourceType === 'GROUP';
    const parsedRepoId = Number(selectedRepoId);
    if (
      isGroupDeployment &&
      (!Number.isInteger(parsedRepoId) || parsedRepoId <= 0)
    ) {
      setFormError('Sélectionner le repository à déployer.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const dep = await deploymentsService.create({
        projectId,
        environmentId,
        branch: branch || undefined,
        repoId: isGroupDeployment ? parsedRepoId : undefined,
      });
      router.push(`/deployments/${dep.id}`);
    } catch (err) {
      setFormError(getApiErrorMessage(err));
      setSubmitting(false);
    }
  };

  const isGroupSource = gitlabConfig?.sourceType === 'GROUP';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/deployments" className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700">
          <ArrowLeft size={15} /> Back to Deployments
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
            <Rocket size={20} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Launch Deployment</h1>
            <p className="text-sm text-slate-500">Select a project, environment, and branch to deploy.</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        {loadingProjects ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : projects.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-slate-500">No projects available. Create a project first.</p>
            <Link href="/projects/new" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700">
              Create Project
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {formError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>
            )}

            {/* Project */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                Project <span className="text-red-400">*</span>
              </label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Environment */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                Environment <span className="text-red-400">*</span>
              </label>
              {loadingEnvs ? (
                <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
              ) : environments.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                  No environments configured for this project.
                  {isAdmin ? (
                    <>
                      {' '}
                      <Link href={`/projects/${projectId}/environments`} className="font-semibold underline">
                        Add one here
                      </Link>
                    </>
                  ) : (
                    ' Ask an admin to create one.'
                  )}
                </div>
              ) : (
                <select value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                  {environments.map((env) => (
                    <option key={env.id} value={env.id}>
                      {env.name} — {env.server.name} ({env.server.host})
                    </option>
                  ))}
                </select>
              )}
              {envError && (
                <p className="mt-2 text-xs text-red-600">
                  {envError}
                </p>
              )}
            </div>

            {isGroupSource && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                  Repository <span className="text-red-400">*</span>
                </label>
                <p className="mb-2 text-xs text-amber-700">
                  Sélectionner le repository à déployer.
                </p>
                {loadingRepos ? (
                  <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
                ) : groupRepos.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                    Aucun repository trouvé dans ce groupe GitLab.
                  </div>
                ) : (
                  <select
                    value={selectedRepoId}
                    onChange={(e) => setSelectedRepoId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">Select repository</option>
                    {groupRepos.map((repo) => (
                      <option key={repo.id} value={String(repo.id)}>
                        {repo.path_with_namespace ?? repo.name ?? `Repo ${String(repo.id)}`}
                      </option>
                    ))}
                  </select>
                )}
                {repoError && (
                  <p className="mt-2 text-xs text-red-600">
                    {repoError}
                  </p>
                )}
              </div>
            )}

            {/* Branch */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                Branch
              </label>
              {loadingBranches ? (
                <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
              ) : branches.length > 0 ? (
                <select value={branch} onChange={(e) => setBranch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}{b.default ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              ) : isGroupSource ? (
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder={
                    selectedRepoId
                      ? 'Branch not found, enter manually'
                      : 'Select repository first'
                  }
                  disabled={!selectedRepoId}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              ) : (
                <input type="text" value={branch} onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              )}
              <p className="mt-1 text-xs text-slate-400">
                {isGroupSource
                  ? selectedRepoId
                    ? branches.length === 0
                      ? 'Aucune branche chargée, vous pouvez la saisir manuellement.'
                      : 'Branches chargées depuis le repository sélectionné.'
                    : 'Sélectionner le repository à déployer.'
                  : branches.length === 0
                    ? 'GitLab not connected — enter branch name manually.'
                    : 'Select from your GitLab branches.'}
              </p>
              {branchError && (
                <p className="mt-2 text-xs text-red-600">
                  {branchError}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Link href="/deployments"
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                Cancel
              </Link>
              <button type="submit" disabled={submitting || !projectId || !environmentId || (isGroupSource && !selectedRepoId)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60">
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}
                {submitting ? 'Launching…' : 'Launch Deployment'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Info box */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
        <p className="text-xs font-semibold text-indigo-700">How it works</p>
        <ul className="mt-2 space-y-1 text-xs text-indigo-600">
          <li>→ The backend pulls the selected branch from GitLab</li>
          <li>→ Builds a Docker image and pushes it to the registry</li>
          <li>→ Ansible deploys the container on the environment server</li>
          <li>→ Live logs appear on the deployment detail page</li>
        </ul>
      </div>
    </div>
  );
}
