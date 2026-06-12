'use client';

import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  GitlabBranch as ProjectSourceBranch,
  GitlabGroupImportMode as SourceImportMode,
  GitlabRepo as ProjectSourceRepo,
} from '@/types/project';
import type { ServiceType } from '@/types/service';

export type SelectedGroupRepository = {
  repo: ProjectSourceRepo;
  branch: string;
  serviceName: string;
  serviceType: ServiceType;
};

const SERVICE_TYPE_OPTIONS: { value: ServiceType; label: string }[] = [
  { value: 'APPLICATION', label: 'Application' },
  { value: 'DATABASE', label: 'Database' },
  { value: 'COMPOSE', label: 'Compose' },
];

function repoPath(repo: ProjectSourceRepo): string {
  return repo.pathWithNamespace ?? repo.path_with_namespace ?? repo.path ?? repo.name;
}

function repoDefaultBranch(repo: ProjectSourceRepo): string {
  return repo.defaultBranch ?? repo.default_branch ?? 'main';
}

function repoWebUrl(repo: ProjectSourceRepo): string | undefined {
  return repo.webUrl ?? repo.web_url;
}

export type GroupReposPickerProps = {
  groupRepos: ProjectSourceRepo[];
  groupRepoSearch: string;
  groupRepoPage: number;
  groupRepoTotalPages: number | null;
  fetchingGroupRepos: boolean;
  selectedGroupRepos: Record<number, SelectedGroupRepository>;
  branchesByRepo: Record<number, ProjectSourceBranch[]>;
  loadingBranchesByRepo: Record<number, boolean>;
  importMode: SourceImportMode;
  onSearchChange: (value: string) => void;
  onFetch: (page: number) => void;
  onToggleRepo: (repo: ProjectSourceRepo) => void;
  onUpdateSelectedRepo: (repoId: number, patch: Partial<SelectedGroupRepository>) => void;
  onImportModeChange: (mode: SourceImportMode) => void;
};

export function GroupReposPicker({
  groupRepos,
  groupRepoSearch,
  groupRepoPage,
  groupRepoTotalPages,
  fetchingGroupRepos,
  selectedGroupRepos,
  branchesByRepo,
  loadingBranchesByRepo,
  importMode,
  onSearchChange,
  onFetch,
  onToggleRepo,
  onUpdateSelectedRepo,
  onImportModeChange,
}: GroupReposPickerProps) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--hover)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
            Search repositories
          </label>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
            />
            <input
              type="text"
              value={groupRepoSearch}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="frontend, backend, api..."
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-9 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
            />
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          loading={fetchingGroupRepos}
          onClick={() => onFetch(1)}
        >
          Fetch repositories
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {groupRepos.map((repo) => {
          const selected = Boolean(selectedGroupRepos[repo.id]);
          return (
            <button
              type="button"
              key={repo.id}
              onClick={() => onToggleRepo(repo)}
              className={`rounded-xl border p-3 text-left transition ${
                selected
                  ? 'border-green-500/50 bg-green-500/10'
                  : 'border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card)]/70'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {repo.name}
                  </p>
                  <p className="mt-0.5 break-all text-[11px] text-[var(--text-secondary)]">
                    {repoPath(repo)}
                  </p>
                </div>
                <span className="rounded-full bg-[var(--bg-card)]/20 px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                  {repo.visibility ?? 'repo'}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
                Default branch: <span className="font-mono">{repoDefaultBranch(repo)}</span>
              </p>
              {repoWebUrl(repo) && (
                <p className="mt-1 truncate text-[11px] text-[var(--text-secondary)]">
                  {repoWebUrl(repo)}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {groupRepos.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span>
            {Object.keys(selectedGroupRepos).length} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={groupRepoPage <= 1 || fetchingGroupRepos}
              onClick={() => onFetch(groupRepoPage - 1)}
              className="rounded-lg border border-[var(--border)] px-2 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <span>
              Page {groupRepoPage}
              {groupRepoTotalPages ? ` / ${groupRepoTotalPages}` : ''}
            </span>
            <button
              type="button"
              disabled={
                fetchingGroupRepos ||
                (groupRepoTotalPages !== null && groupRepoPage >= groupRepoTotalPages)
              }
              onClick={() => onFetch(groupRepoPage + 1)}
              className="rounded-lg border border-[var(--border)] px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {Object.values(selectedGroupRepos).length > 0 && (
        <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Import mode
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(['ONE_APPLICATION', 'SEPARATE_PROJECTS'] as const).map((mode) => (
                <label
                  key={mode}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${
                    importMode === mode
                      ? 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]'
                      : 'border-[var(--border)] text-[var(--text-secondary)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === mode}
                    onChange={() => onImportModeChange(mode)}
                    className="mr-2"
                  />
                  {mode === 'ONE_APPLICATION'
                    ? 'One application, multiple services'
                    : 'Separate project per repository'}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {Object.values(selectedGroupRepos).map((selection) => {
              const branches = branchesByRepo[selection.repo.id] ?? [
                { name: selection.branch, default: true },
              ];
              return (
                <div
                  key={selection.repo.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {repoPath(selection.repo)}
                    </p>
                    {loadingBranchesByRepo[selection.repo.id] && (
                      <Loader2 size={13} className="animate-spin text-[var(--text-secondary)]" />
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      type="text"
                      value={selection.serviceName}
                      onChange={(event) =>
                        onUpdateSelectedRepo(selection.repo.id, {
                          serviceName: event.target.value,
                        })
                      }
                      className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-primary)] outline-none"
                      placeholder="service name"
                    />
                    <select
                      value={selection.serviceType}
                      onChange={(event) =>
                        onUpdateSelectedRepo(selection.repo.id, {
                          serviceType: event.target.value as ServiceType,
                        })
                      }
                      className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-primary)] outline-none"
                    >
                      {SERVICE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selection.branch}
                      onChange={(event) =>
                        onUpdateSelectedRepo(selection.repo.id, {
                          branch: event.target.value,
                        })
                      }
                      className="h-10 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 font-mono text-sm text-[var(--text-primary)] outline-none"
                    >
                      {branches.map((branch) => (
                        <option key={branch.name} value={branch.name}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
