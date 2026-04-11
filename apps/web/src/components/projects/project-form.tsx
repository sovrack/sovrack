'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { CreateProjectPayload, ProjectDetail } from '@/types/project';
import type { UserListItem } from '@/types/user';

type ProjectFormInitialValues = Partial<
  Pick<ProjectDetail, 'name' | 'description' | 'gitlabUrl' | 'branch'>
>;

type ProjectFormProps = {
  initialValues?: ProjectFormInitialValues;
  onSubmit: (payload: CreateProjectPayload) => Promise<void>;
  submitLabel?: string;
  loading?: boolean;
  error?: string | null;
  includeOwnerSelect?: boolean;
  ownerOptions?: UserListItem[];
  initialOwnerId?: string;
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
      gitlabUrl: gitlabUrl.trim(),
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
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Name */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
          Project Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-awesome-app"
          required
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      {/* Description */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A short description of this project"
          rows={3}
          className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      {/* GitLab URL */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
          GitLab Repository URL
        </label>
        <input
          type="url"
          value={gitlabUrl}
          onChange={(e) => setGitlabUrl(e.target.value)}
          placeholder="https://gitlab.com/yourname/yourrepo"
          required
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
        />
        <p className="mt-1 text-xs text-slate-400">
          This repository URL is required. Token and project ID can be added later.
        </p>
      </div>

      {/* Default branch */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
          Default Branch
        </label>
        <input
          type="text"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="main"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      {includeOwnerSelect && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
            Project Owner
          </label>
          <select
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Select owner</option>
            {ownerOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.fullName} ({user.email})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">
            Only developers can be assigned as project OWNER.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={
          loading ||
          !name.trim() ||
          !gitlabUrl.trim() ||
          (includeOwnerSelect && !ownerId)
        }
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        {submitLabel}
      </button>
    </form>
  );
}
