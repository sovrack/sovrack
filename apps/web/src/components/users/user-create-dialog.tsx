'use client';

import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { Loader2, Shield, X } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/api';
import { usersService } from '@/services/users.service';
import type { UserListItem } from '@/types/user';

const createUserSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Le nom est obligatoire'),
  email: z
    .string()
    .trim()
    .min(1, 'L’email est obligatoire')
    .email('Email invalide'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters'),
  role: z.enum(['ADMIN', 'DEVELOPER']),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof createUserSchema>;
type FormErrors = Partial<Record<keyof FormData, string>>;

type UserCreateDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: (user: UserListItem) => Promise<void> | void;
};

const DEFAULT_FORM: FormData = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  role: 'DEVELOPER',
  isActive: true,
};

export function UserCreateDialog({
  open,
  onClose,
  onCreated,
}: UserCreateDialogProps) {
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(DEFAULT_FORM);
    setErrors({});
    setError(null);
    setSubmitting(false);
  }, [open]);

  const canSubmit = useMemo(
    () =>
      form.firstName.trim().length > 0 &&
      form.lastName.trim().length > 0 &&
      form.email.trim().length > 0 &&
      form.password.length >= 8,
    [form.email, form.firstName, form.lastName, form.password.length],
  );

  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = createUserSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors: FormErrors = {};

      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !nextErrors[field as keyof FormData]) {
          nextErrors[field as keyof FormData] = issue.message;
        }
      }

      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const created = await usersService.create({
        fullName: `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
        email: parsed.data.email,
        password: parsed.data.password,
        role: parsed.data.role,
      });

      if (!parsed.data.isActive) {
        await usersService.toggleActive(created.id);
      }

      await onCreated?.(created);
      onClose();
    } catch (createError) {
      setError(getApiErrorMessage(createError));
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
              Administration
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)] text-[var(--text-primary)]">
              Create User
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)] text-[var(--text-secondary)]">
              Add a developer or administrator account with validated credentials.
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)] text-[var(--text-secondary)]">
                First name <span className="text-red-400">*</span>
              </label>
              <input
                value={form.firstName}
                onChange={(event) => setField('firstName', event.target.value)}
                placeholder="John"
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20 border-[var(--border)] text-[var(--text-primary)]"
              />
              {errors.firstName && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.firstName}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)] text-[var(--text-secondary)]">
                Last name <span className="text-red-400">*</span>
              </label>
              <input
                value={form.lastName}
                onChange={(event) => setField('lastName', event.target.value)}
                placeholder="Developer"
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20 border-[var(--border)] text-[var(--text-primary)]"
              />
              {errors.lastName && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.lastName}
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)] text-[var(--text-secondary)]">
                Email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setField('email', event.target.value)}
                placeholder="dev@devops.com"
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20 border-[var(--border)] text-[var(--text-primary)]"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.email}
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)] text-[var(--text-secondary)]">
                Password <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(event) => setField('password', event.target.value)}
                placeholder="Minimum 8 characters"
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20 border-[var(--border)] text-[var(--text-primary)]"
              />
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.password}
                </p>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)] text-[var(--text-secondary)]">
                Role
              </p>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label
                  className={`cursor-pointer rounded-xl border px-4 py-3 transition ${
                    form.role === 'DEVELOPER'
                      ? 'border-[var(--border)] bg-[var(--active)]'
                      : 'border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--hover)]'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="role"
                      checked={form.role === 'DEVELOPER'}
                      onChange={() => setField('role', 'DEVELOPER')}
                      className="mt-1 accent-zinc-500"
                    />
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)] text-[var(--text-primary)]">
                        Developer
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] text-[var(--text-secondary)]">
                        Deploy and operate assigned projects.
                      </p>
                    </div>
                  </div>
                </label>

                <label
                  className={`cursor-pointer rounded-xl border px-4 py-3 transition ${
                    form.role === 'ADMIN'
                      ? 'border-[var(--border)] bg-[var(--active)]'
                      : 'border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--hover)]'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="role"
                      checked={form.role === 'ADMIN'}
                      onChange={() => setField('role', 'ADMIN')}
                      className="mt-1 accent-zinc-500"
                    />
                    <div>
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)] text-[var(--text-primary)]">
                        <Shield size={14} />
                        Admin
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] text-[var(--text-secondary)]">
                        Full access to platform administration.
                      </p>
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="inline-flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-2.5 border-[var(--border)]">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setField('isActive', event.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border)] text-[var(--text-secondary)] focus:ring-zinc-300"
                />
                <span className="text-sm text-[var(--text-secondary)] text-[var(--text-primary)]">
                  Active by default
                </span>
              </label>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-card)] px-6 py-4 border-[var(--border)] bg-[var(--bg-card)]">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit || submitting}>
            {submitting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              'Create User'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
