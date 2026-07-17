"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Loader2, Shield } from "lucide-react";
import { Alert } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { getApiErrorMessage } from "@/shared/lib/api";
import { usersService } from "@/features/users/api/users.service";
import type { UserListItem } from "@/features/users/types/user";

const createUserSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().min(1, "Email is required").email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ADMIN", "DEVELOPER"]),
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
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  role: "DEVELOPER",
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
        if (typeof field === "string" && !nextErrors[field as keyof FormData]) {
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissable={!submitting}
      size="xl"
      title="Create user"
      description="Add a developer or administrator account with validated credentials."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="user-create-form"
            disabled={!canSubmit || submitting}
          >
            {submitting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              "Create user"
            )}
          </Button>
        </>
      }
    >
      <form id="user-create-form" onSubmit={handleSubmit}>
        {error && (
          <div className="mb-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              First name <span className="text-red-400">*</span>
            </label>
            <input
              value={form.firstName}
              onChange={(event) => setField("firstName", event.target.value)}
              placeholder="John"
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
            />
            {errors.firstName && (
              <p className="mt-1 text-xs text-red-600">{errors.firstName}</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Last name <span className="text-red-400">*</span>
            </label>
            <input
              value={form.lastName}
              onChange={(event) => setField("lastName", event.target.value)}
              placeholder="Developer"
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
            />
            {errors.lastName && (
              <p className="mt-1 text-xs text-red-600">{errors.lastName}</p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setField("email", event.target.value)}
              placeholder="dev@deployautomation.local"
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email}</p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Password <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setField("password", event.target.value)}
              placeholder="Minimum 8 characters"
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password}</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Role
            </p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label
                className={`cursor-pointer rounded-xl border px-4 py-3 transition ${
                  form.role === "DEVELOPER"
                    ? "border-[var(--border)] bg-[var(--active)]"
                    : "border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--hover)]"
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="role"
                    checked={form.role === "DEVELOPER"}
                    onChange={() => setField("role", "DEVELOPER")}
                    className="mt-1 accent-zinc-500"
                  />
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      Developer
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Deploy and operate assigned projects.
                    </p>
                  </div>
                </div>
              </label>

              <label
                className={`cursor-pointer rounded-xl border px-4 py-3 transition ${
                  form.role === "ADMIN"
                    ? "border-[var(--border)] bg-[var(--active)]"
                    : "border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--hover)]"
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="role"
                    checked={form.role === "ADMIN"}
                    onChange={() => setField("role", "ADMIN")}
                    className="mt-1 accent-zinc-500"
                  />
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
                      <Shield size={14} />
                      Admin
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Full access to platform administration.
                    </p>
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="inline-flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-2.5">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setField("isActive", event.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)] text-[var(--text-secondary)] focus:ring-zinc-300"
              />
              <span className="text-sm text-[var(--text-primary)]">
                Active by default
              </span>
            </label>
          </div>
        </div>
      </form>
    </Modal>
  );
}
