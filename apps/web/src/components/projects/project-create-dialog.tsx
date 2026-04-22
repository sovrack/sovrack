'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/api';

type ProjectCreateDialogProps = {
  open: boolean;
  onClose: () => void;
  onNext?: (payload: {
    name: string;
    description?: string;
  }) => Promise<void> | void;
};

export function ProjectCreateDialog({
  open,
  onClose,
  onNext,
}: ProjectCreateDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loadingNext, setLoadingNext] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setName('');
    setDescription('');
    setLoadingNext(false);
    setError(null);
  }, [open]);

  const handleNext = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoadingNext(true);
    setError(null);
    try {
      await onNext?.({
        name: name.trim(),
        description: description.trim() || undefined,
      });
    } catch (createError) {
      setError(getApiErrorMessage(createError));
    } finally {
      setLoadingNext(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />

      <form
        onSubmit={handleNext}
        className="relative z-10 w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
              Step 1 / 3
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
              Create Project
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Start with project identity only. Source and build setup come next.
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

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Project name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Mon App Backend"
              required
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="API REST Node.js"
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
            />
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            Next steps after create: connect GitLab source, then configure build mode.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loadingNext}>
            Cancel
          </Button>
          <Button type="submit" loading={loadingNext} disabled={!name.trim()}>
            Next
          </Button>
        </div>
      </form>
    </div>
  );
}
