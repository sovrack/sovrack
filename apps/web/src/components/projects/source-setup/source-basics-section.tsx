'use client';

import type {
  SourceProviderOption,
} from '@/types/project';

export type SourceBasicsSectionProps = {
  providers: SourceProviderOption[];
  providerId: string;
  defaultProviderId: string;
  loadingProviders: boolean;
  sourceType: 'REPO' | 'GROUP';
  gitlabUrl: string;
  sourceId: string;
  defaultBranch: string;
  onProviderIdChange: (value: string) => void;
  onSourceTypeChange: (value: 'REPO' | 'GROUP') => void;
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
              {provider.name} · {provider.type === 'GITHUB' ? 'GitHub' : 'GitLab'}
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
          Provider URL
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
            {sourceType === 'REPO' ? 'Dépôt (chemin ou ID)' : 'Groupe (chemin ou ID)'}
          </label>
          <input
            type="text"
            value={sourceId}
            onChange={(event) => onSourceIdChange(event.target.value)}
            placeholder={sourceType === 'REPO' ? 'groupe/projet' : 'company/my-apps'}
            required
            className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
          />
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Recommandé : le chemin <span className="font-mono">groupe/projet</span> (provider-agnostic). L&apos;ID numérique reste accepté.
          </p>
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
