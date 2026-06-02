'use client';

import type {
  GitlabProviderOption,
  GitlabSourceType,
} from '@/types/project';

export type SourceBasicsSectionProps = {
  providers: GitlabProviderOption[];
  providerId: string;
  defaultProviderId: string;
  loadingProviders: boolean;
  sourceType: GitlabSourceType;
  gitlabUrl: string;
  sourceId: string;
  defaultBranch: string;
  onProviderIdChange: (value: string) => void;
  onSourceTypeChange: (value: GitlabSourceType) => void;
  onGitlabUrlChange: (value: string) => void;
  onSourceIdChange: (value: string) => void;
  onDefaultBranchChange: (value: string) => void;
};

export function SourceBasicsSection({
  providers,
  providerId,
  defaultProviderId,
  loadingProviders,
  sourceType,
  gitlabUrl,
  sourceId,
  defaultBranch,
  onProviderIdChange,
  onSourceTypeChange,
  onGitlabUrlChange,
  onSourceIdChange,
  onDefaultBranchChange,
}: SourceBasicsSectionProps) {
  return (
    <>
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
          Provider
        </label>
        <select
          value={providerId}
          onChange={(event) => onProviderIdChange(event.target.value)}
          disabled={loadingProviders}
          className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-60"
        >
          <option value="">Use default provider</option>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
              {provider.id === defaultProviderId ? ' (default)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
          Source type
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(['REPO', 'GROUP'] as const).map((type) => (
            <label
              key={type}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                sourceType === type
                  ? 'border-[var(--border)] bg-[var(--hover)] text-[var(--text-primary)]'
                  : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)]'
              }`}
            >
              <input
                type="radio"
                name="sourceType"
                checked={sourceType === type}
                onChange={() => onSourceTypeChange(type)}
                className="mr-2"
              />
              {type === 'REPO' ? 'Repository (single repo)' : 'Group (multiple repos)'}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
          GitLab URL
        </label>
        <input
          type="url"
          value={gitlabUrl}
          onChange={(event) => onGitlabUrlChange(event.target.value)}
          required
          className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
            {sourceType === 'REPO' ? 'Project ID' : 'Group ID or path'}
          </label>
          <input
            type={sourceType === 'REPO' ? 'number' : 'text'}
            min={sourceType === 'REPO' ? 1 : undefined}
            value={sourceId}
            onChange={(event) => onSourceIdChange(event.target.value)}
            placeholder={sourceType === 'REPO' ? '123456' : 'company/my-apps'}
            required
            className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
          />
        </div>
        {sourceType === 'REPO' && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Default branch
            </label>
            <input
              type="text"
              value={defaultBranch}
              onChange={(event) => onDefaultBranchChange(event.target.value)}
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
            />
          </div>
        )}
      </div>
    </>
  );
}
