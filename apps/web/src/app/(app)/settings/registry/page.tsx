'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/hooks/auth/use-auth';
import { getApiErrorMessage } from '@/lib/api';
import { platformConfigService } from '@/services/platform-config.service';
import type {
  CreateRegistryConfigPayload,
  RegistryConfig,
  RegistryProviderType,
  UpdateRegistryConfigPayload,
} from '@/types/platform-config';

type ToastTone = 'success' | 'error';
type ToastItem = { id: number; message: string; tone: ToastTone };
type DialogMode = 'create' | 'edit';

type RegistryFormState = {
  id?: string;
  name: string;
  type: RegistryProviderType;
  username: string;
  password: string;
  registryUrl: string;
  isDefault: boolean;
};

const REGISTRY_TYPE_LABELS: Record<RegistryProviderType, string> = {
  DOCKER_HUB: 'Docker Hub',
  DOCKER_REGISTRY: 'Docker Registry',
  GITLAB: 'GitLab Container Registry',
  ECR: 'AWS ECR',
  GCR: 'Google Container Registry',
};

const REGISTRY_TYPE_OPTIONS: RegistryProviderType[] = [
  'DOCKER_HUB',
  'DOCKER_REGISTRY',
  'GITLAB',
  'ECR',
  'GCR',
];

function RegistryLogo({ type }: { type: RegistryProviderType }) {
  if (type === 'DOCKER_HUB') {
    return (
      <svg viewBox="0 0 64 64" className="h-5 w-5" fill="none" aria-hidden>
        <path
          d="M32 4C17.66 4 6 15.66 6 30c0 14.34 11.66 26 26 26s26-11.66 26-26c0-14.34-11.66-26-26-26z"
          fill="#0092e6"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M32 4C17.66 4 6 15.66 6 30c0 14.34 11.66 26 26 26s26-11.66 26-26c0-14.34-11.66-26-26-26z" />
    </svg>
  );
}

function ConnectionStatusBadge({
  isConnected,
  error,
}: {
  isConnected: boolean;
  error: string | null;
}) {
  if (isConnected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-400">
        <CheckCircle2 size={12} />
        Connectedd
      </span>
    );
  }

  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
        <XCircle size={12} />
        Not connected
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
      <AlertCircle size={12} />
      Not tested
    </span>
  );
}

function RegistryForm({
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
              GitLab : Deploy token → le <strong>nom du token</strong> · PAT → ton <strong>login GitLab</strong> · token de projet → le <strong>nom du token</strong>.
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
              Token avec le scope <strong>read_registry</strong> (write_registry pour push). Deploy token recommandé (Settings → Repository → Deploy tokens).
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

export default function RegistrySettingsPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);
  const [selectedRegistry, setSelectedRegistry] = useState<RegistryConfig | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  const { data: registries = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ['registry-configs'],
    queryFn: () => platformConfigService.listRegistryConfigs(),
    enabled: isAdmin,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const error = queryError ? getApiErrorMessage(queryError) : null;
  const invalidate = useCallback(() => queryClient.invalidateQueries({ queryKey: ['registry-configs'] }), [queryClient]);

  const addToast = useCallback((message: string, tone: ToastTone) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((previous) => [...previous, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((previous) => previous.filter((item) => item.id !== id));
    }, 5000);
  }, []);

  const formData = useMemo(() => {
    if (!selectedRegistry) {
      return undefined;
    }

    return {
      id: selectedRegistry.id,
      name: selectedRegistry.name,
      type: selectedRegistry.type,
      username: selectedRegistry.username,
      password: '',
      registryUrl: selectedRegistry.registryUrl,
      isDefault: selectedRegistry.isDefault,
    } satisfies RegistryFormState;
  }, [selectedRegistry]);

  const handleFormSubmit = useCallback(
    async (data: RegistryFormState) => {
      setIsSubmitting(true);

      try {
        if (dialogMode === 'create') {
          const payload: CreateRegistryConfigPayload = {
            name: data.name.trim(),
            type: data.type,
            isDefault: data.isDefault,
            ...(data.username.trim() ? { username: data.username.trim() } : {}),
            ...(data.password.trim() ? { password: data.password.trim() } : {}),
            ...(data.registryUrl.trim() ? { registryUrl: data.registryUrl.trim() } : {}),
          };

          await platformConfigService.createRegistryConfig(payload);
          addToast('Registry created avec succes.', 'success');
        }

        if (dialogMode === 'edit' && data.id) {
          const payload: UpdateRegistryConfigPayload = {
            name: data.name.trim(),
            type: data.type,
            isDefault: data.isDefault,
            ...(data.username.trim() ? { username: data.username.trim() } : { username: '' }),
            ...(data.password.trim() ? { password: data.password.trim() } : {}),
            ...(data.registryUrl.trim() ? { registryUrl: data.registryUrl.trim() } : { registryUrl: '' }),
          };

          await platformConfigService.updateRegistryConfig(data.id, payload);
          addToast('Registry updated avec succes.', 'success');
        }

        setDialogMode(null);
        setSelectedRegistry(null);
        await invalidate();
      } catch (submitError) {
        addToast(getApiErrorMessage(submitError), 'error');
      } finally {
        setIsSubmitting(false);
      }
    },
    [addToast, dialogMode, invalidate],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteId) {
      return;
    }

    try {
      await platformConfigService.deleteRegistryConfig(deleteId);
      addToast('Registry deleted avec succes.', 'success');
      setDeleteId(null);
      await invalidate();
    } catch (deleteError) {
      addToast(getApiErrorMessage(deleteError), 'error');
    }
  }, [addToast, deleteId, invalidate]);

  const handleTest = useCallback(
    async (id: string) => {
      setTestingId(id);

      try {
        const result = await platformConfigService.testRegistryConnection(id);
        addToast(result.message, result.ok ? 'success' : 'error');
        await invalidate();
      } catch (testError) {
        addToast(getApiErrorMessage(testError), 'error');
      } finally {
        setTestingId(null);
      }
    },
    [addToast, invalidate],
  );

  const handleSetDefault = useCallback(
    async (id: string) => {
      setSettingDefaultId(id);

      try {
        await platformConfigService.setDefaultRegistryConfig(id);
        addToast('Default registry defini.', 'success');
        await invalidate();
      } catch (setDefaultError) {
        addToast(getApiErrorMessage(setDefaultError), 'error');
      } finally {
        setSettingDefaultId(null);
      }
    },
    [addToast, invalidate],
  );

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Settings"
          title="Registries"
          description="This section is restricted to administrators."
        />
        <Alert tone="warning" title="Restricted access">
          You do not have permission to access the registry configuration.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuration"
        title="Registries"
        description="Manage your container registries (Docker Hub, ECR, GCR, etc.)."
        actions={
          dialogMode === null ? (
            <Button icon={<Plus size={14} />} onClick={() => setDialogMode('create')}>
              Add registry
            </Button>
          ) : null
        }
      />

      {error && (
        <Alert tone="error" title="Error">
          {error}
        </Alert>
      )}

      <div className="space-y-3">
        {toasts.map((toast) => (
          <Alert
            key={toast.id}
            tone={toast.tone === 'success' ? 'success' : 'error'}
            title={toast.tone === 'success' ? 'Success' : 'Error'}
          >
            {toast.message}
          </Alert>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--text-secondary)]" />
        </div>
      )}

      {!loading && registries.length === 0 && dialogMode === null && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
          <p className="mb-4 text-[var(--text-secondary)]">No registry configured</p>
          <Button icon={<Plus size={14} />} onClick={() => setDialogMode('create')}>
            Add registry
          </Button>
        </div>
      )}

      {dialogMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => {
              if (isSubmitting) return;
              setDialogMode(null);
              setSelectedRegistry(null);
            }}
            aria-hidden
          />
          <div className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                  Settings
                </p>
                <h3 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                  {dialogMode === 'create' ? 'Add registry' : 'Edit registry'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isSubmitting) return;
                  setDialogMode(null);
                  setSelectedRegistry(null);
                }}
                className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-4">
              <RegistryForm
                initialData={formData}
                mode={dialogMode}
                onSubmit={handleFormSubmit}
                onCancel={() => {
                  setDialogMode(null);
                  setSelectedRegistry(null);
                }}
                isSubmitting={isSubmitting}
                withTopDivider={false}
              />
            </div>
          </div>
        </div>
      )}

      {!loading && registries.length > 0 && dialogMode === null && (
        <div className="grid gap-4">
          {registries.map((registry) => (
            <div
              key={registry.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-[var(--bg-secondary)] p-2">
                    <RegistryLogo type={registry.type} />
                  </div>

                  <div>
                    <h4 className="font-semibold text-[var(--text-primary)]">{registry.name}</h4>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {REGISTRY_TYPE_LABELS[registry.type]}
                      {registry.isDefault && (
                        <span className="ml-2 inline-block rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
                          Par defaut
                        </span>
                      )}
                    </p>
                    {registry.registryUrl && (
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        URL: {registry.registryUrl}
                      </p>
                    )}
                  </div>
                </div>

                <ConnectionStatusBadge
                  isConnected={registry.isConnected}
                  error={registry.connectionError}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Pencil size={12} />}
                  onClick={() => {
                    setSelectedRegistry(registry);
                    setDialogMode('edit');
                  }}
                >
                  Edit
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  loading={testingId === registry.id}
                  onClick={() => void handleTest(registry.id)}
                >
                  Test
                </Button>

                {!registry.isDefault && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={settingDefaultId === registry.id}
                    onClick={() => void handleSetDefault(registry.id)}
                  >
                    Set default
                  </Button>
                )}

                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Trash2 size={12} />}
                  onClick={() => setDeleteId(registry.id)}
                >
                  Delete
                </Button>
              </div>

              {registry.connectionError && (
                <div className="mt-3 rounded-md bg-red-500/10 p-3 text-sm text-red-400">
                  <strong>Connection error:</strong> {registry.connectionError}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete le registre"
        description="This action cannot be undone et supprime la configuration du registre."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
