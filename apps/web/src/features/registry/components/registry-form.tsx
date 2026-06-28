'use client';

import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import type { RegistryProviderType } from '@/features/platform';
import { Button } from '@/shared/ui/button';

export type DialogMode = 'create' | 'edit';

export type RegistryFormState = {
  id?: string;
  name: string;
  type: RegistryProviderType;
  username: string;
  password: string;
  registryUrl: string;
  isDefault: boolean;
};

export const REGISTRY_TYPE_LABELS: Record<RegistryProviderType, string> = {
  DOCKER_HUB: 'Docker Hub',
  DOCKER_REGISTRY: 'Docker Registry',
  GITLAB: 'GitLab Container Registry',
  ECR: 'AWS ECR',
  GCR: 'Google Container Registry',
};

export const REGISTRY_TYPE_OPTIONS: RegistryProviderType[] = [
  'DOCKER_HUB',
  'DOCKER_REGISTRY',
  'GITLAB',
  'ECR',
  'GCR',
];

/** Formulaire create/edit d'un registre. Extrait du god-page settings/registry (P2). */
export function RegistryForm({
  initialData,
  mode,
  onSubmit,
  onCancel,
  isSubmitting,
  withTopDivider = true,
}: {
  initialData?: RegistryFormState;
  mode: DialogMode;
  onSubmit: (data: RegistryFormState) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  withTopDivider?: boolean;
}) {
  const [form, setForm] = useState<RegistryFormState>(
    initialData ?? {
      name: '',
      type: 'DOCKER_HUB',
      username: '',
      password: '',
      registryUrl: '',
      isDefault: false,
    },
  );

  const submitDisabled =
    isSubmitting ||
    form.name.trim().length === 0 ||
    (form.type === 'DOCKER_HUB' && form.username.trim().length === 0);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(form);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`space-y-4 ${withTopDivider ? 'border-t border-[var(--border)] pt-4' : ''}`}
    >
      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)]">Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, name: event.target.value }))
          }
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
          placeholder="e.g. Team Docker Hub"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)]">
          Registry type
        </label>
        <select
          value={form.type}
          onChange={(event) =>
            setForm((previous) => ({
              ...previous,
              type: event.target.value as RegistryProviderType,
            }))
          }
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          {REGISTRY_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {REGISTRY_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      {(form.type === 'DOCKER_HUB' ||
        form.type === 'DOCKER_REGISTRY' ||
        form.type === 'GITLAB') && (
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)]">
            Username
          </label>
          <input
            type="text"
            value={form.username}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, username: event.target.value }))
            }
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
            placeholder="Registry user"
          />
          {form.type === 'GITLAB' && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              GitLab : Deploy token → le <strong>nom du token</strong> · PAT → ton{' '}
              <strong>login GitLab</strong> · token de projet → le{' '}
              <strong>nom du token</strong>.
            </p>
          )}
        </div>
      )}

      {(form.type === 'DOCKER_HUB' ||
        form.type === 'DOCKER_REGISTRY' ||
        form.type === 'GITLAB') && (
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)]">
            Password / token
          </label>
          <input
            type="password"
            value={form.password}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, password: event.target.value }))
            }
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
            placeholder={mode === 'edit' ? 'Leave empty to keep' : 'Secret token'}
          />
          {form.type === 'GITLAB' && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Token avec le scope <strong>read_registry</strong> (write_registry pour
              push). Deploy token recommandé (Settings → Repository → Deploy tokens).
            </p>
          )}
        </div>
      )}

      {(form.type === 'DOCKER_REGISTRY' || form.type === 'GITLAB') && (
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)]">
            Registry URL
          </label>
          <input
            type="url"
            value={form.registryUrl}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                registryUrl: event.target.value,
              }))
            }
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
            placeholder="https://registry.example.com"
          />
        </div>
      )}

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, isDefault: event.target.checked }))
          }
          className="rounded border border-[var(--border)]"
        />
        <span className="text-sm text-[var(--text-secondary)]">
          Set as default registry
        </span>
      </label>

      <div className="flex gap-2 pt-2">
        <Button
          type="submit"
          disabled={submitDisabled}
          icon={isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        >
          {mode === 'create' ? 'Add' : 'Update'}
        </Button>
        <Button variant="secondary" type="button" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
