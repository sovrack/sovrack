'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/api';
import { projectsService } from '@/services/projects.service';
import type {
  GitlabBranch,
  GitlabGroupImportMode,
  GitlabProviderOption,
  GitlabRepo,
  GitlabSourceType,
  ProjectServiceType,
} from '@/types/project';
import {
  GroupReposPicker,
  type SelectedGroupRepository,
} from './source-setup/group-repos-picker';
import { SourceBasicsSection } from './source-setup/source-basics-section';

type ProjectSourceSetupDialogProps = {
  open: boolean;
  projectId?: string;
  projectDraft?: {
    name: string;
    description?: string;
  } | null;
  initialGitlabUrl?: string | null;
  initialDefaultBranch?: string | null;
  initialProviderId?: string | null;
  initialSourceType?: GitlabSourceType | null;
  initialProjectId?: number | null;
  initialGroupId?: number | null;
  onClose: () => void;
  onNext: (projectId: string) => Promise<void> | void;
};

function repoPath(repo: GitlabRepo): string {
  return repo.pathWithNamespace ?? repo.path_with_namespace ?? repo.path ?? repo.name;
}

function repoDefaultBranch(repo: GitlabRepo): string {
  return repo.defaultBranch ?? repo.default_branch ?? 'main';
}

function inferServiceType(repo: GitlabRepo): ProjectServiceType {
  const value = `${repo.name} ${repoPath(repo)}`.toLowerCase();
  if (/front|web|ui|client/.test(value)) return 'FRONTEND';
  if (/api|back|server/.test(value)) return 'BACKEND';
  if (/worker|queue|job|cron/.test(value)) return 'WORKER';
  if (/static|site|docs/.test(value)) return 'STATIC';
  if (/db|database|postgres|mysql|redis/.test(value)) return 'DATABASE';
  return 'OTHER';
}

export function ProjectSourceSetupDialog({
  open,
  projectId,
  projectDraft,
  initialGitlabUrl,
  initialDefaultBranch,
  initialProviderId,
  initialSourceType,
  initialProjectId,
  initialGroupId,
  onClose,
  onNext,
}: ProjectSourceSetupDialogProps) {
  const [providers, setProviders] = useState<GitlabProviderOption[]>([]);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [providerId, setProviderId] = useState('');
  const [sourceType, setSourceType] = useState<GitlabSourceType>('REPO');
  const [gitlabUrl, setGitlabUrl] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [gitlabToken, setGitlabToken] = useState('');
  const [showTokenField, setShowTokenField] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [loadedBranches, setLoadedBranches] = useState(0);
  const [groupRepos, setGroupRepos] = useState<GitlabRepo[]>([]);
  const [groupRepoSearch, setGroupRepoSearch] = useState('');
  const [groupRepoPage, setGroupRepoPage] = useState(1);
  const [groupRepoTotalPages, setGroupRepoTotalPages] = useState<number | null>(null);
  const [fetchingGroupRepos, setFetchingGroupRepos] = useState(false);
  const [selectedGroupRepos, setSelectedGroupRepos] = useState<Record<number, SelectedGroupRepository>>({});
  const [branchesByRepo, setBranchesByRepo] = useState<Record<number, GitlabBranch[]>>({});
  const [loadingBranchesByRepo, setLoadingBranchesByRepo] = useState<Record<number, boolean>>({});
  const [importMode, setImportMode] = useState<GitlabGroupImportMode>('ONE_APPLICATION');

  const defaultProviderId = useMemo(
    () => providers.find((provider) => provider.isDefault)?.id ?? '',
    [providers],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setError(null);
    setConnected(false);
    setLoadedBranches(0);
    setGroupRepos([]);
    setGroupRepoSearch('');
    setGroupRepoPage(1);
    setGroupRepoTotalPages(null);
    setSelectedGroupRepos({});
    setBranchesByRepo({});
    setLoadingBranchesByRepo({});
    setImportMode('ONE_APPLICATION');
    setGitlabToken('');
    setShowTokenField(false);
    setCreatedProjectId(projectId ?? null);
    setSourceType(initialSourceType === 'GROUP' ? 'GROUP' : 'REPO');
    setSourceId(
      initialSourceType === 'GROUP'
        ? initialGroupId
          ? String(initialGroupId)
          : ''
        : initialProjectId
          ? String(initialProjectId)
          : '',
    );
    setGitlabUrl(initialGitlabUrl?.trim() || 'https://gitlab.com');
    setDefaultBranch(initialDefaultBranch?.trim() || 'main');

    setLoadingProviders(true);
    projectsService
      .getGitlabProviders()
      .then((nextProviders) => {
        setProviders(nextProviders);
        setProviderId(
          initialProviderId?.trim() ||
            (nextProviders.find((provider) => provider.isDefault)?.id ??
              nextProviders[0]?.id ??
              ''),
        );
      })
      .catch((providerError) => {
        setProviders([]);
        setProviderId('');
        setError(getApiErrorMessage(providerError));
      })
      .finally(() => {
        setLoadingProviders(false);
      });
  }, [
    initialDefaultBranch,
    initialGitlabUrl,
    initialGroupId,
    initialProjectId,
    initialProviderId,
    initialSourceType,
    open,
    projectId,
  ]);

  const handleFetchGroupRepositories = async (nextPage = groupRepoPage) => {
    setError(null);
    const groupId = sourceId.trim();
    if (!groupId) {
      setError('Group ID or path is required.');
      return;
    }

    setFetchingGroupRepos(true);
    try {
      const result = await projectsService.fetchGitlabGroupRepositories({
        providerId: providerId || undefined,
        groupId,
        gitlabUrl: gitlabUrl.trim() || undefined,
        gitlabToken: gitlabToken.trim() || undefined,
        page: nextPage,
        perPage: 8,
        search: groupRepoSearch.trim() || undefined,
      });
      setGroupRepos(result.items);
      setGroupRepoPage(result.pagination.page);
      setGroupRepoTotalPages(result.pagination.totalPages);
    } catch (fetchError) {
      setError(getApiErrorMessage(fetchError));
    } finally {
      setFetchingGroupRepos(false);
    }
  };

  const loadBranchesForRepo = async (repo: GitlabRepo) => {
    if (branchesByRepo[repo.id] || loadingBranchesByRepo[repo.id]) {
      return;
    }

    setLoadingBranchesByRepo((prev) => ({ ...prev, [repo.id]: true }));
    try {
      const branches = await projectsService.fetchGitlabProjectBranches({
        providerId: providerId || undefined,
        gitlabProjectId: repo.id,
        gitlabUrl: gitlabUrl.trim() || undefined,
        gitlabToken: gitlabToken.trim() || undefined,
      });
      setBranchesByRepo((prev) => ({ ...prev, [repo.id]: branches }));
    } catch {
      setBranchesByRepo((prev) => ({
        ...prev,
        [repo.id]: [{ name: repoDefaultBranch(repo), default: true }],
      }));
    } finally {
      setLoadingBranchesByRepo((prev) => ({ ...prev, [repo.id]: false }));
    }
  };

  const toggleGroupRepo = (repo: GitlabRepo) => {
    setSelectedGroupRepos((prev) => {
      if (prev[repo.id]) {
        const next = { ...prev };
        delete next[repo.id];
        return next;
      }

      void loadBranchesForRepo(repo);
      return {
        ...prev,
        [repo.id]: {
          repo,
          branch: repoDefaultBranch(repo),
          serviceName: repo.name,
          serviceType: inferServiceType(repo),
        },
      };
    });
  };

  const updateSelectedRepo = (
    repoId: number,
    patch: Partial<SelectedGroupRepository>,
  ) => {
    setSelectedGroupRepos((prev) => {
      const current = prev[repoId];
      if (!current) return prev;
      return { ...prev, [repoId]: { ...current, ...patch } };
    });
  };

  const handleConnect = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsedId = Number(sourceId);
    if (
      sourceType === 'REPO' &&
      (!Number.isFinite(parsedId) || parsedId <= 0)
    ) {
      setError(
        'Project ID invalide.',
      );
      return;
    }

    if (sourceType === 'GROUP' && !sourceId.trim()) {
      setError('Group ID or path is required.');
      return;
    }

    const selectedRepositories = Object.values(selectedGroupRepos);
    if (sourceType === 'GROUP' && selectedRepositories.length === 0) {
      setError('Fetch the group repositories, then select at least one repository.');
      return;
    }

    setSubmitting(true);
    try {
      const normalizedGitlabUrl = gitlabUrl.trim();
      const normalizedDefaultBranch = defaultBranch.trim() || 'main';
      const groupRepositoriesPayload = selectedRepositories.map((selection) => ({
        id: selection.repo.id,
        name: selection.repo.name,
        pathWithNamespace: repoPath(selection.repo),
        defaultBranch: selection.branch,
        serviceName: selection.serviceName,
        serviceType: selection.serviceType,
      }));

      const connectPayload = {
        providerId: providerId || undefined,
        sourceType,
        gitlabUrl: normalizedGitlabUrl,
        defaultBranch:
          sourceType === 'REPO' ? normalizedDefaultBranch : undefined,
        gitlabId: sourceType === 'REPO' ? parsedId : undefined,
        gitlabGroupId: sourceType === 'GROUP' ? sourceId.trim() : undefined,
        // Optional PAT — overrides the provider token for this connection
        gitlabToken: gitlabToken.trim() || undefined,
      };

      let targetProjectId = projectId ?? createdProjectId;
      if (!targetProjectId) {
        if (!projectDraft?.name?.trim()) {
          setError('Project name is required before source configuration.');
          setSubmitting(false);
          return;
        }

        if (sourceType === 'GROUP') {
          const imported = await projectsService.importGitlabGroup({
            name: projectDraft.name.trim(),
            description: projectDraft.description?.trim() || undefined,
            gitlabUrl: normalizedGitlabUrl,
            providerId: providerId || undefined,
            gitlabToken: gitlabToken.trim() || undefined,
            groupId: sourceId.trim(),
            importMode,
            repositories: groupRepositoriesPayload,
          });
          targetProjectId = imported.projects[0]?.id;
          if (!targetProjectId) {
            throw new Error('Import GitLab Group completed without project.');
          }
          setCreatedProjectId(targetProjectId);
        } else {
          const created = await projectsService.create({
            name: projectDraft.name.trim(),
            description: projectDraft.description?.trim() || undefined,
            gitlabUrl: normalizedGitlabUrl,
            branch: normalizedDefaultBranch,
            providerId: providerId || undefined,
            sourceType,
            gitlabId: parsedId,
            // Pass PAT so backend can authenticate GitLab during project creation
            gitlabToken: gitlabToken.trim() || undefined,
          });
          targetProjectId = created.id;
          setCreatedProjectId(created.id);
        }
      } else {
        await projectsService.connectGitlab(targetProjectId, connectPayload);
        if (sourceType === 'GROUP') {
          for (const repository of groupRepositoriesPayload) {
            await projectsService.createService(targetProjectId, {
              name: repository.serviceName || repository.name,
              type: repository.serviceType,
              sourceProviderId: providerId || undefined,
              gitlabProjectId: repository.id,
              repositoryPath: repository.pathWithNamespace,
              defaultBranch: repository.defaultBranch,
              composeServiceName:
                repository.serviceName || repository.name,
            });
          }
        }
      }

      if (sourceType === 'REPO') {
        const branches = await projectsService.getBranches(targetProjectId);
        setLoadedBranches(branches.length);
      } else {
        setLoadedBranches(0);
      }

      setConnected(true);
    } catch (connectError) {
      const msg = getApiErrorMessage(connectError);
      const is401 = msg.includes('401') || msg.toLowerCase().includes('unauthorized');
      const noToken = msg.toLowerCase().includes('ni oauth') || msg.toLowerCase().includes('ni admin');
      if (is401 || noToken) {
        setError(
          `${msg}. Enter a Personal Access Token (PAT) below — go to GitLab → User Settings → Access Tokens → create a token with api or read_api scope.`,
        );
        setShowTokenField(true);
      } else {
        setError(msg);
      }
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

      <div className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        <div className="shrink-0 flex items-start justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
              Step 2 / 3
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
              Connect GitLab Source
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Choose provider, source type, and repository/group identifier.
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

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && <Alert tone="error">{error}</Alert>}

          {!connected ? (
            <form onSubmit={handleConnect} className="space-y-4" data-source-setup-form>
              <SourceBasicsSection
                providers={providers}
                providerId={providerId}
                defaultProviderId={defaultProviderId}
                loadingProviders={loadingProviders}
                sourceType={sourceType}
                gitlabUrl={gitlabUrl}
                sourceId={sourceId}
                defaultBranch={defaultBranch}
                onProviderIdChange={setProviderId}
                onSourceTypeChange={setSourceType}
                onGitlabUrlChange={setGitlabUrl}
                onSourceIdChange={setSourceId}
                onDefaultBranchChange={setDefaultBranch}
              />

              {sourceType === 'GROUP' && (
                <GroupReposPicker
                  groupRepos={groupRepos}
                  groupRepoSearch={groupRepoSearch}
                  groupRepoPage={groupRepoPage}
                  groupRepoTotalPages={groupRepoTotalPages}
                  fetchingGroupRepos={fetchingGroupRepos}
                  selectedGroupRepos={selectedGroupRepos}
                  branchesByRepo={branchesByRepo}
                  loadingBranchesByRepo={loadingBranchesByRepo}
                  importMode={importMode}
                  onSearchChange={setGroupRepoSearch}
                  onFetch={(page) => void handleFetchGroupRepositories(page)}
                  onToggleRepo={toggleGroupRepo}
                  onUpdateSelectedRepo={updateSelectedRepo}
                  onImportModeChange={setImportMode}
                />
              )}

              {/* Personal Access Token — optional override */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)]">
                <button
                  type="button"
                  onClick={() => setShowTokenField((v) => !v)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                >
                  <span>Personal Access Token (optional override)</span>
                  {showTokenField ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {showTokenField && (
                  <div className="border-t border-[var(--border)] px-4 pb-4 pt-3 space-y-2">
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Required if your GitLab provider has no configured token, or if you get a 401 error.
                      Go to <strong>GitLab → User Settings → Access Tokens</strong> and create a token with <code>api</code> or <code>read_api</code> scope.
                    </p>
                    <input
                      type="password"
                      placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
                      value={gitlabToken}
                      onChange={(event) => setGitlabToken(event.target.value)}
                      autoComplete="off"
                      className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
                    />
                  </div>
                )}
              </div>

            </form>
          ) : (
            <div className="space-y-4">
              <Alert tone="success" title="Source connected">
                {sourceType === 'REPO'
                  ? `${String(loadedBranches)} branches loaded successfully.`
                  : 'Group source connected successfully.'}
              </Alert>
            </div>
          )}
        </div>

        {/* Sticky footer — always visible regardless of content height */}
        <div className="shrink-0 flex items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-card)] px-6 py-3">
          {!connected ? (
            <>
              <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="button"
                loading={submitting}
                onClick={() => {
                  const form = document.querySelector<HTMLFormElement>(
                    '[data-source-setup-form]',
                  );
                  form?.requestSubmit();
                }}
              >
                {sourceType === 'GROUP'
                  ? 'Import selected repositories'
                  : 'Verify and connect'}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const nextProjectId = projectId ?? createdProjectId;
                  if (!nextProjectId) return;
                  void onNext(nextProjectId);
                }}
              >
                Next: Build setup
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
