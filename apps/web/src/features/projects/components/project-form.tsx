"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CreateProjectPayload } from "@/features/projects/types/project";
import type { UserListItem } from "@/features/users";
import { Alert } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";

type ProjectFormInitialValues = {
  name?: string;
  description?: string | null;
  maxConcurrentDeploys?: number | null;
};

/** Payload the form emits — superset of create with the update-only deploy cap.
 * Convention: maxConcurrentDeploys 0 = unlimited (matches the backend DTO). */
export type ProjectFormPayload = CreateProjectPayload & {
  maxConcurrentDeploys?: number;
};

type ProjectFormProps = {
  initialValues?: ProjectFormInitialValues;
  onSubmit: (payload: ProjectFormPayload) => Promise<void>;
  submitLabel?: string;
  loading?: boolean;
  error?: string | null;
  includeOwnerSelect?: boolean;
  ownerOptions?: UserListItem[];
  initialOwnerId?: string;
  cancelHref?: string;
  onCancel?: () => void;
  /** Show the multi-tenant "max concurrent deploys" cap (edit mode only). */
  showDeployCap?: boolean;
};

export function ProjectForm({
  initialValues,
  onSubmit,
  submitLabel = "Create Project",
  loading = false,
  error,
  includeOwnerSelect = false,
  ownerOptions = [],
  initialOwnerId = "",
  cancelHref = "/projects",
  onCancel,
  showDeployCap = false,
}: ProjectFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(
    initialValues?.description ?? "",
  );
  const [ownerId, setOwnerId] = useState(initialOwnerId);
  const [maxConcurrentDeploys, setMaxConcurrentDeploys] = useState(
    initialValues?.maxConcurrentDeploys
      ? String(initialValues.maxConcurrentDeploys)
      : "", // null / 0 / undefined → empty = unlimited
  );

  useEffect(() => {
    if (includeOwnerSelect) {
      setOwnerId(initialOwnerId);
    }
  }, [includeOwnerSelect, initialOwnerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: ProjectFormPayload = {
      name: name.trim(),
      description: description.trim() || undefined,
    };

    if (includeOwnerSelect && ownerId) {
      payload.ownerId = ownerId;
    }

    if (showDeployCap) {
      const trimmed = maxConcurrentDeploys.trim();
      // Empty = unlimited (0, per the backend convention); else the positive cap.
      payload.maxConcurrentDeploys = trimmed === "" ? 0 : Number(trimmed);
    }

    await onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--hover)]/70 p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
              Project identity
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Naming and ownership for this project.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Project Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-awesome-app"
              required
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short description of this project"
              rows={3}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
            />
          </div>

          {includeOwnerSelect && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                Project Owner
              </label>
              <select
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
              >
                <option value="">Select owner</option>
                {ownerOptions.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName} ({user.email})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Only developers can be assigned as project OWNER.
              </p>
            </div>
          )}
        </div>

        {showDeployCap && (
          <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--hover)]/70 p-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                Resource limits
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Multi-tenant fair-share for this project.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                Max concurrent deploys
              </label>
              <input
                type="number"
                min={1}
                value={maxConcurrentDeploys}
                onChange={(e) => setMaxConcurrentDeploys(e.target.value)}
                placeholder="Unlimited"
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:ring-2 focus:ring-zinc-500/20"
              />
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Caps simultaneous in-flight deployments so one project
                can&apos;t monopolize the deploy workers. Leave empty for
                unlimited.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--hover)] text-[var(--text-primary)]"
          >
            Cancel
          </button>
        ) : (
          <Link
            href={cancelHref}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--hover)] text-[var(--text-primary)]"
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
