'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Rocket, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { projectsService } from '@/services/projects.service';
import { environmentsService } from '@/services/environments.service';
import { deploymentsService } from '@/services/deployments.service';
import { getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/auth/use-auth';
import type {
  ProjectListItem,
  GitlabBranch,
  GitlabConfig,
  GitlabRepo,
  ProjectService,
} from '@/types/project';
import type {
  DeploymentBuildMode,
  DeploymentStrategy,
} from '@/types/deployment';
import type { Environment } from '@/types/environment';

type DeploymentCreateDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: (deploymentId: string) => Promise<void> | void;
};

export function DeploymentCreateDialog({
  open,
  onClose,
  onCreated,
}: DeploymentCreateDialogProps) {
  const { isAdmin } = useAuth();

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [branches, setBranches] = useState<GitlabBranch[]>([]);
  const [groupRepos, setGroupRepos] = useState<GitlabRepo[]>([]);
  const [services, setServices] = useState<ProjectService[]>([]);
  const [gitlabConfig, setGitlabConfig] = useState<GitlabConfig | null>(null);

  const [projectId, setProjectId] = useState('');
  const [environmentId, setEnvironmentId] = useState('');
  const [branch, setBranch] = useState('');
  const [selectedRepoId, setSelectedRepoId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [strategy, setStrategy] = useState<DeploymentStrategy>('standard');
  const [buildMode, setBuildMode] = useState<DeploymentBuildMode>('registry');
  const [overrideImage, setOverrideImage] = useState('');

  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingEnvs, setLoadingEnvs] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [envError, setEnvError] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [repoError, setRepoError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let isCancelled = false;

    setProjects([]);
    setEnvironments([]);
    setBranches([]);
    setGroupRepos([]);
    setServices([]);
    setGitlabConfig(null);
    setProjectId('');
    setEnvironmentId('');
    setBranch('');
    setSelectedRepoId('');
    setSelectedServiceId('');
    setStrategy('standard');
    setBuildMode('registry');
    setOverrideImage('');
    setError(null);
    setFormError(null);
    setEnvError(null);
    setBranchError(null);
    setRepoError(null);

    setLoadingProjects(true);
    projectsService
      .getAll()
      .then((list) => {
        if (isCancelled) {
          return;
        }
        setProjects(list);
        if (list.length > 0) {
          setProjectId(list[0].id);
        }
      })
      .catch((fetchError) => {
        if (isCancelled) {
          return;
        }
        setError(getApiErrorMessage(fetchError));
      })
      .finally(() => {
        if (!isCancelled) {
          setLoadingProjects(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !projectId) {
      return;
    }

    let isCancelled = false;

    setEnvironments([]);
    setBranches([]);
    setGroupRepos([]);
    setServices([]);
    setGitlabConfig(null);
    setEnvironmentId('');
    setBranch('');
    setSelectedRepoId('');
    setSelectedServiceId('');
    setEnvError(null);
    setBranchError(null);
    setRepoError(null);

    setLoadingEnvs(true);
    environmentsService
      .getAll(projectId)
      .then((envs) => {
        if (isCancelled) {
          return;
        }
        setEnvironments(envs);
        if (envs.length > 0) {
          setEnvironmentId(envs[0].id);
        }
      })
      .catch((envFetchError) => {
        if (isCancelled) {
          return;
        }
        setEnvError(getApiErrorMessage(envFetchError));
      })
      .finally(() => {
        if (!isCancelled) {
          setLoadingEnvs(false);
        }
      });

    projectsService
      .getServices(projectId)
      .then((items) => {
        if (isCancelled) {
          return;
        }
        setServices(items);
        const firstService = items[0];
        if (firstService) {
          setSelectedServiceId(firstService.id);
          if (firstService.gitlabProjectId) {
            setSelectedRepoId(String(firstService.gitlabProjectId));
          }
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setServices([]);
        }
      });

    projectsService
      .getGitlabConfig(projectId)
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
            if (repos.length > 0) {
              const firstRepoId = repos[0]?.id;
              setSelectedRepoId(
                Number.isFinite(firstRepoId) ? String(firstRepoId) : '',
              );
            } else {
              setBranchError('Aucun repository disponible dans ce groupe GitLab.');
            }
          } catch (repoFetchError) {
            if (isCancelled) {
              return;
            }
            setRepoError(getApiErrorMessage(repoFetchError));
          } finally {
            if (!isCancelled) {
              setLoadingRepos(false);
            }
          }
          return;
        }

        setLoadingBranches(true);
        projectsService
          .getBranches(projectId)
          .then((list) => {
            if (isCancelled) {
              return;
            }
            setBranches(list);
            const defaultBranch = list.find((item) => item.default);
            setBranch(defaultBranch?.name ?? list[0]?.name ?? '');
          })
          .catch((branchFetchError) => {
            if (isCancelled) {
              return;
            }
            const selectedProject = projects.find((item) => item.id === projectId);
            if (selectedProject?.branch) {
              setBranch(selectedProject.branch);
            }
            setBranchError(getApiErrorMessage(branchFetchError));
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
        const selectedProject = projects.find((item) => item.id === projectId);
        if (selectedProject?.branch) {
          setBranch(selectedProject.branch);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [open, projectId, projects]);

  useEffect(() => {
    if (!open || !projectId || gitlabConfig?.sourceType !== 'GROUP') {
      return;
    }

    if (!selectedRepoId) {
      setBranches([]);
      setBranch('');
      setBranchError('Sélectionner le repository à déployer.');
      return;
    }

    const parsedRepoId = Number(selectedRepoId);
    if (!Number.isInteger(parsedRepoId) || parsedRepoId <= 0) {
      setBranches([]);
      setBranch('');
      setBranchError('Repository GitLab invalide.');
      return;
    }

    let isCancelled = false;

    setLoadingBranches(true);
    setBranchError(null);
    projectsService
      .getBranches(projectId, parsedRepoId)
      .then((list) => {
        if (isCancelled) {
          return;
        }
        setBranches(list);
        const defaultBranch = list.find((item) => item.default);
        setBranch(defaultBranch?.name ?? list[0]?.name ?? '');
      })
      .catch((branchFetchError) => {
        if (isCancelled) {
          return;
        }
        setBranches([]);
        setBranch('');
        setBranchError(getApiErrorMessage(branchFetchError));
      })
      .finally(() => {
        if (!isCancelled) {
          setLoadingBranches(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [open, projectId, selectedRepoId, gitlabConfig?.sourceType]);

  const isGroupSource = gitlabConfig?.sourceType === 'GROUP';

  // overrideImage est indépendant du buildMode — une image externe remplace tout flux de build

  const handleServiceChange = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    const service = services.find((item) => item.id === serviceId);
    if (service?.gitlabProjectId) {
      setSelectedRepoId(String(service.gitlabProjectId));
    }
    if (service?.defaultBranch) {
      setBranch(service.defaultBranch);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!projectId || !environmentId) {
      setFormError('Please select a project and environment.');
      return;
    }

    const parsedRepoId = Number(selectedRepoId);
    if (isGroupSource && (!Number.isInteger(parsedRepoId) || parsedRepoId <= 0)) {
      setFormError('Sélectionner le repository à déployer.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const created = await deploymentsService.create({
        projectId,
        serviceId: selectedServiceId || undefined,
        environmentId,
        branch: branch || undefined,
        strategy,
        buildMode,
        overrideImage: overrideImage.trim().length > 0 ? overrideImage.trim() : undefined,
        repoId: isGroupSource ? parsedRepoId : undefined,
      });
      onClose();
      await onCreated?.(created.id);
    } catch (submitError) {
      setFormError(getApiErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl border-[var(--border)] bg-[var(--bg-card)]"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-4 border-[var(--border)] bg-[var(--bg-card)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
              Deployments
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)] text-[var(--text-primary)]">
              Launch Deployment
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)] text-[var(--text-secondary)]">
              Select source, target environment, and branch.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {error && <Alert tone="error">{error}</Alert>}
          {formError && <Alert tone="error">{formError}</Alert>}

          {loadingProjects ? (
            <div className="space-y-4">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-12 animate-pulse rounded-xl bg-[var(--hover)] bg-[var(--bg-card)]"
                />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <Alert tone="warning">
              <div className="space-y-2">
                <p>No projects available. Create a project first.</p>
                {isAdmin && (
                  <Link
                    href="/projects?dialog=create-project"
                    className="inline-flex items-center rounded-lg border border-yellow-300/70 bg-yellow-200/40 px-3 py-1.5 text-xs font-semibold text-yellow-900 transition hover:bg-yellow-200/60"
                  >
                    Create Project
                  </Link>
                )}
              </div>
            </Alert>
          ) : (
            <>
              <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--hover)]/70 p-4 border-[var(--border)]">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                    Source configuration
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)] text-[var(--text-secondary)]">
                    Select project, repository source, and deployment branch.
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)] text-[var(--text-secondary)]">
                    Project <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={projectId}
                    onChange={(event) => setProjectId(event.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-100 border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>

                {services.length > 0 && (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)] text-[var(--text-secondary)]">
                      Service
                    </label>
                    <select
                      value={selectedServiceId}
                      onChange={(event) => handleServiceChange(event.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-100 border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                    >
                      <option value="">Whole project / legacy mode</option>
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name} — {service.type}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {isGroupSource && (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)] text-[var(--text-secondary)]">
                      Repository <span className="text-red-400">*</span>
                    </label>
                    {loadingRepos ? (
                      <div className="h-12 animate-pulse rounded-xl bg-[var(--hover)] bg-[var(--bg-card)]" />
                    ) : services.length > 0 ? (
                      <select
                        value={selectedRepoId}
                        onChange={(event) => {
                          const repoId = event.target.value;
                          setSelectedRepoId(repoId);
                          const service = services.find(
                            (item) => String(item.gitlabProjectId) === repoId,
                          );
                          if (service) {
                            setSelectedServiceId(service.id);
                          }
                        }}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-100 border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                      >
                        <option value="">Select service repository</option>
                        {services
                          .filter((service) => service.gitlabProjectId)
                          .map((service) => (
                            <option key={service.id} value={String(service.gitlabProjectId)}>
                              {service.name} — {service.repositoryPath ?? service.gitlabProjectId}
                            </option>
                          ))}
                      </select>
                    ) : groupRepos.length === 0 ? (
                      <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs text-yellow-700">
                        Aucun repository trouvé dans ce groupe GitLab.
                      </div>
                    ) : (
                      <select
                        value={selectedRepoId}
                        onChange={(event) => setSelectedRepoId(event.target.value)}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-100 border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]"
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

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)] text-[var(--text-secondary)]">
                    Branch
                  </label>
                  {loadingBranches ? (
                    <div className="h-12 animate-pulse rounded-xl bg-[var(--hover)] bg-[var(--bg-card)]" />
                  ) : branches.length > 0 ? (
                    <select
                      value={branch}
                      onChange={(event) => setBranch(event.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-100 border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                    >
                      {branches.map((branchItem) => (
                        <option key={branchItem.name} value={branchItem.name}>
                          {branchItem.name}
                          {branchItem.default ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                  ) : isGroupSource ? (
                    <input
                      type="text"
                      value={branch}
                      onChange={(event) => setBranch(event.target.value)}
                      placeholder={
                        selectedRepoId
                          ? 'Branch not found, enter manually'
                          : 'Select repository first'
                      }
                      disabled={!selectedRepoId}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-100 disabled:cursor-not-allowed disabled:bg-[var(--hover)] border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                    />
                  ) : (
                    <input
                      type="text"
                      value={branch}
                      onChange={(event) => setBranch(event.target.value)}
                      placeholder="main"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-100 border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                    />
                  )}
                  {branchError && (
                    <p className="mt-2 text-xs text-red-600">
                      {branchError}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                      Strategy
                    </label>
                    <select
                      name="strategy"
                      value={strategy}
                      onChange={(event) => setStrategy(event.target.value as DeploymentStrategy)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-100"
                    >
                      <option value="standard">Standard</option>
                      <option value="blue-green">Blue-Green (Zero Downtime)</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                      Build Mode
                    </label>
                    <select
                      name="buildMode"
                      value={buildMode}
                      onChange={(event) => setBuildMode(event.target.value as DeploymentBuildMode)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-100"
                    >
                      <option value="registry">GitLab Registry (CI/CD)</option>
                      <option value="local">Build local sur VPS</option>
                      <option value="compose">Docker Compose</option>
                    </select>
                    {buildMode === 'compose' && (
                      <p className="mt-2 text-xs text-[var(--text-secondary)]">
                        Le fichier <span className="font-mono">docker-compose.yml</span> de votre repo
                        sera déployé tel quel sur le serveur cible. Aucun build Docker n&apos;est lancé.
                      </p>
                    )}
                  </div>
                </div>

                {/* Image externe — disponible quel que soit le mode de build */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                    Image Docker externe (optionnel)
                  </label>
                  <input
                    name="overrideImage"
                    value={overrideImage}
                    onChange={(event) => setOverrideImage(event.target.value)}
                    placeholder="docker.io/org/app:tag ou registry.gitlab.com/..."
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-100"
                  />
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Si renseigné, cette image est utilisée directement sans passer par le build CI/CD
                  </p>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--hover)]/70 p-4 border-[var(--border)]">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                    Target environment
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)] text-[var(--text-secondary)]">
                    Select where this deployment will run.
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)] text-[var(--text-secondary)]">
                    Environment <span className="text-red-400">*</span>
                  </label>
                  {loadingEnvs ? (
                    <div className="h-12 animate-pulse rounded-xl bg-[var(--hover)] bg-[var(--bg-card)]" />
                  ) : environments.length === 0 ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-amber-300">Aucun environnement configuré</p>
                        <p className="text-xs text-amber-400/70">Associez un VPS à ce projet avant de déployer.</p>
                      </div>
                      {projectId && (
                        <Link
                          href={`/projects/${projectId}?tab=environments`}
                          onClick={onClose}
                          className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/30"
                        >
                          Configurer →
                        </Link>
                      )}
                    </div>
                  ) : (
                    <select
                      value={environmentId}
                      onChange={(event) => setEnvironmentId(event.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-100 border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                    >
                      {environments.map((environment) => (
                        <option key={environment.id} value={environment.id}>
                          {environment.name} — {environment.server.name} ({environment.server.host})
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
              </div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-card)] px-6 py-4 border-[var(--border)] bg-[var(--bg-card)]">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={submitting}
            disabled={
              projects.length === 0 ||
              !projectId ||
              !environmentId ||
              (isGroupSource && !selectedRepoId)
            }
            icon={submitting ? undefined : <Rocket size={15} />}
          >
            Launch Deployment
          </Button>
        </div>
      </form>
    </div>
  );
}
