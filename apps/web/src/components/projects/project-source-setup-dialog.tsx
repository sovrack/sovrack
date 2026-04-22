'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/api';
import { projectsService } from '@/services/projects.service';
import type { GitlabProviderOption, GitlabSourceType } from '@/types/project';

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
  const [submitting, setSubmitting] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [loadedBranches, setLoadedBranches] = useState(0);

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

  const handleConnect = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsedId = Number(sourceId);
    if (!Number.isFinite(parsedId) || parsedId <= 0) {
      setError(
        sourceType === 'REPO'
          ? 'Project ID invalide.'
          : 'Group ID invalide.',
      );
      return;
    }

    setSubmitting(true);
    try {
      let targetProjectId = projectId ?? createdProjectId;
      if (!targetProjectId) {
        if (!projectDraft?.name?.trim()) {
          setError('Project name is required before source configuration.');
          setSubmitting(false);
          return;
        }

        const created = await projectsService.create({
          name: projectDraft.name.trim(),
          description: projectDraft.description?.trim() || undefined,
        });
        targetProjectId = created.id;
        setCreatedProjectId(created.id);
      }

      await projectsService.connectGitlab(targetProjectId, {
        providerId: providerId || undefined,
        sourceType,
        gitlabUrl: gitlabUrl.trim(),
        defaultBranch: defaultBranch.trim() || 'main',
        gitlabId: sourceType === 'REPO' ? parsedId : undefined,
        gitlabGroupId: sourceType === 'GROUP' ? parsedId : undefined,
      });

      if (sourceType === 'REPO') {
        const branches = await projectsService.getBranches(targetProjectId);
        setLoadedBranches(branches.length);
      } else {
        setLoadedBranches(0);
      }

      setConnected(true);
    } catch (connectError) {
      setError(getApiErrorMessage(connectError));
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

      <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-4">
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

        <div className="space-y-4 px-6 py-5">
          {error && <Alert tone="error">{error}</Alert>}

          {!connected ? (
            <form onSubmit={handleConnect} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                  Provider
                </label>
                <select
                  value={providerId}
                  onChange={(event) => setProviderId(event.target.value)}
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
                        onChange={() => setSourceType(type)}
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
                  onChange={(event) => setGitlabUrl(event.target.value)}
                  required
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                    {sourceType === 'REPO' ? 'Project ID' : 'Group ID'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={sourceId}
                    onChange={(event) => setSourceId(event.target.value)}
                    required
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                    Default branch
                  </label>
                  <input
                    type="text"
                    value={defaultBranch}
                    onChange={(event) => setDefaultBranch(event.target.value)}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
                <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" loading={submitting}>
                  Verify and connect
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <Alert tone="success" title="Source connected">
                {sourceType === 'REPO'
                  ? `${String(loadedBranches)} branches loaded successfully.`
                  : 'Group source connected successfully.'}
              </Alert>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const nextProjectId = projectId ?? createdProjectId;
                    if (!nextProjectId) {
                      setError('Project not found for next step.');
                      return;
                    }
                    void onNext(nextProjectId);
                  }}
                >
                  Next: Build setup
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
