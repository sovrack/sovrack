'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Project, CreateProjectPayload } from '@/types/project';

type ProjectFormProps = {
  initialValues?: Partial<Project>;
  onSubmit: (payload: CreateProjectPayload) => Promise<void>;
  submitLabel?: string;
  loading?: boolean;
  error?: string | null;
};

export function ProjectForm({
  initialValues,
  onSubmit,
  submitLabel = 'Create Project',
  loading = false,
  error,
}: ProjectFormProps) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [description, setDescription] = useState(
    initialValues?.description ?? '',
  );
  const [gitlabUrl, setGitlabUrl] = useState(initialValues?.gitlabUrl ?? '');
  const [defaultBranch, setDefaultBranch] = useState(
    initialValues?.defaultBranch ?? 'main',
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      gitlabUrl: gitlabUrl.trim() || undefined,
      defaultBranch: defaultBranch.trim() || 'main',
    });
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
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
        />
        <p className="mt-1 text-xs text-slate-400">
          You can connect GitLab later from the project settings.
        </p>
      </div>

      {/* Default branch */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
          Default Branch
        </label>
        <input
          type="text"
          value={defaultBranch}
          onChange={(e) => setDefaultBranch(e.target.value)}
          placeholder="main"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        {submitLabel}
      </button>
    </form>
  );
}
