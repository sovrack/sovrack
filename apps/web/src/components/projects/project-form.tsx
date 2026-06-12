'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CreateProjectPayload, ProjectDetail } from '@/types/project';
import type { UserListItem } from '@/types/user';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type ProjectFormInitialValues = {
  name?: string;
  description?: string | null;
  gitlabUrl?: string;
  branch?: string;
};

type ProjectFormProps = {
  initialValues?: ProjectFormInitialValues;
  onSubmit: (payload: CreateProjectPayload) => Promise<void>;
  submitLabel?: string;
  loading?: boolean;
  error?: string | null;
  includeOwnerSelect?: boolean;
  ownerOptions?: UserListItem[];
  initialOwnerId?: string;
  cancelHref?: string;
  onCancel?: () => void;
};

export function ProjectForm({
  initialValues,
  onSubmit,
  submitLabel = 'Create Project',
  loading = false,
  error,
  includeOwnerSelect = false,
  ownerOptions = [],
  initialOwnerId = '',
  cancelHref = '/projects',
  onCancel,
}: ProjectFormProps) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [description, setDescription] = useState(
    initialValues?.description ?? '',
  );
  const [gitlabUrl, setGitlabUrl] = useState(initialValues?.gitlabUrl ?? '');
  const [branch, setBranch] = useState(
    initialValues?.branch ?? 'main',
  );
  const [ownerId, setOwnerId] = useState(initialOwnerId);

  useEffect(() => {
    if (includeOwnerSelect) {
      setOwnerId(initialOwnerId);
    }
  }, [includeOwnerSelect, initialOwnerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: CreateProjectPayload = {
      name: name.trim(),
      description: description.trim() || undefined,
      gitlabUrl: gitlabUrl.trim() || undefined,
      branch: branch.trim() || 'main',
    };

    if (includeOwnerSelect && ownerId) {
      payload.ownerId = ownerId;
    }

    await onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <Alert tone="error">{error}</Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--hover)]/70 p-4 border-[var(--border)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
              Project identity
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)] text-[var(--text-secondary)]">
              Naming and ownership for this project.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)] text-[var(--text-secondary)]">
              Project Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-awesome-app"
              required
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20 border-[var(--border)] text-[var(--text-primary)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)] text-[var(--text-secondary)]">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short description of this project"
              rows={3}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20 border-[var(--border)] text-[var(--text-primary)]"
            />
          </div>

          {includeOwnerSelect && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)] text-[var(--text-secondary)]">
                Project Owner
              </label>
              <select
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20 border-[var(--border)] text-[var(--text-primary)]"
              >
                <option value="">Select owner</option>
                {ownerOptions.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName} ({user.email})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[var(--text-secondary)] text-[var(--text-secondary)]">
                Only developers can be assigned as project OWNER.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--hover)]/70 p-4 border-[var(--border)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
              Git source
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)] text-[var(--text-secondary)]">
              Repository endpoint and default branch.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)] text-[var(--text-secondary)]">
              GitLab Repository URL
            </label>
            <input
              type="url"
              value={gitlabUrl}
              onChange={(e) => setGitlabUrl(e.target.value)}
              placeholder="https://gitlab.com/yourname/yourrepo"
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20 border-[var(--border)] text-[var(--text-primary)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)] text-[var(--text-secondary)]">
              Default Branch
            </label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 font-mono text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20 border-[var(--border)] text-[var(--text-primary)]"
            />
          </div>

          <p className="rounded-xl border border-[var(--border)] bg-[var(--hover)] px-3 py-2 text-xs text-[var(--text-secondary)] border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]">
            This repository URL is required. Token and project ID can be added later.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-4 border-[var(--border)]">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--hover)] border-[var(--border)] text-[var(--text-primary)]"
          >
            Cancel
          </button>
        ) : (
          <Link
            href={cancelHref}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--hover)] border-[var(--border)] text-[var(--text-primary)]"
          >
            Cancel
          </Link>
        )}
        <Button
          type="submit"
          loading={loading}
          disabled={!name.trim() || (includeOwnerSelect && !ownerId)}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
