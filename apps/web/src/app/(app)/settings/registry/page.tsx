'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/hooks/useAuth';
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
  ECR: 'AWS ECR',
  GCR: 'Google Container Registry',
};

const REGISTRY_TYPE_OPTIONS: RegistryProviderType[] = [
  'DOCKER_HUB',
  'DOCKER_REGISTRY',
  'ECR',
  'GCR',
];

function RegistryLogo({ type }: { type: RegistryProviderType }) {
  if (type === 'DOCKER_HUB') {
    return (
      <svg viewBox="0 0 64 64" className="h-5 w-5" fill="none">
        <path
          d="M32 4C17.66 4 6 15.66 6 30c0 14.34 11.66 26 26 26s26-11.66 26-26c0-14.34-11.66-26-26-26z"
          fill="#0092e6"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" className="h-5 w-5" fill="currentColor">
      <path d="M32 4C17.66 4 6 15.66 6 30c0 14.34 11.66 26 26 26s26-11.66 26-26c0-14.34-11.66-26-26-26z" />
    </svg>
  );
}

function ConnectionStatusBadge({ isConnected, error }: { isConnected: boolean; error: string | null }) {
  if (isConnected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-400">
        <CheckCircle2 size={12} />
        Connecté
      </span>
    );
  }

  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
        <XCircle size={12} />
        Non connecté
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
      <AlertCircle size={12} />
      Non testé
    </span>
  );
}

function RegistryForm({
  initialData,
  mode,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  initialData?: RegistryFormState;
  mode: DialogMode;
  onSubmit: (data: RegistryFormState) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState<RegistryFormState>(
    initialData || {
      name: '',
      type: 'DOCKER_HUB',
      username: '',
      password: '',
      registryUrl: '',
      isDefault: false,
    },
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border-t border-[var(--border)] pt-4">
      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)]">
          Nom
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
          placeholder="Ex: Mon Docker Hub"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)]">
          Type de registre
        </label>
        <select
          value={form.type}
          onChange={(e) =>
            setForm({ ...form, type: e.target.value as RegistryProviderType })
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

      {form.type === 'DOCKER_HUB' && (
        <>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Nom d'utilisateur
            </label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
              placeholder="Votre nom d'utilisateur Docker Hub"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Mot de passe / Token
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
              placeholder="Votre mot de passe ou token d'accès"
            />
          </div>
        </>
      )}

      {form.type === 'DOCKER_REGISTRY' && (
        <>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              URL du registre
            </label>
            <input
              type="url"
              value={form.registryUrl}
              onChange={(e) => setForm({ ...form, registryUrl: e.target.value })}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
              placeholder="https://registre.example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Nom d'utilisateur (optionnel)
            </label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Mot de passe (optionnel)
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </div>
        </>
      )}

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
          className="rounded border border-[var(--border)]"
        />
        <span className="text-sm text-[var(--text-secondary)]">
          Définir comme registre par défaut
        </span>
      </label>

      <div className="flex gap-2 pt-2">
        <Button
          type="submit"
          disabled={isSubmitting}
          icon={isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        >
          {mode === 'create' ? 'Ajouter' : 'Mettre à jour'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

export default function RegistrySettingsPage() {
  const { user } = useAuth();
  const [registries, setRegistries] = useState<RegistryConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);
  const [selectedRegistry, setSelectedRegistry] = useState<RegistryConfig | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await platformConfigService.listRegistryConfigs();
      setRegistries(data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreateClick = () => {
    setSelectedRegistry(null);
    setDialogMode('create');
  };

  const handleEditClick = (registry: RegistryConfig) => {
    setSelectedRegistry(registry);
    setDialogMode('edit');
  };

  const handleFormSubmit = async (data: RegistryFormState) => {
    setIsSubmitting(true);
    try {
      if (dialogMode === 'create') {
        const payload: CreateRegistryConfigPayload = {
          name: data.name,
          type: data.type,
          isDefault: data.isDefault,
          ...(data.username && { username: data.username }),
          ...(data.password && { password: data.password }),
          ...(data.registryUrl && { registryUrl: data.registryUrl }),
        };
        await platformConfigService.createRegistryConfig(payload);
        addToast('Registre créé avec succès', 'success');
      } else if (dialogMode === 'edit' && data.id) {
        const payload: UpdateRegistryConfigPayload = {
          name: data.name,
          type: data.type,
          isDefault: data.isDefault,
          ...(data.username && { username: data.username }),
          ...(data.password && { password: data.password }),
          ...(data.registryUrl && { registryUrl: data.registryUrl }),
        };
        await platformConfigService.updateRegistryConfig(data.id, payload);
        addToast('Registre mis à jour avec succès', 'success');
      }
      setDialogMode(null);
      await load();
    } catch (err) {
      addToast(getApiErrorMessage(err), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await platformConfigService.deleteRegistryConfig(id);
      addToast('Registre supprimé avec succès', 'success');
      setDeleteId(null);
      await load();
    } catch (err) {
      addToast(getApiErrorMessage(err), 'error');
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await platformConfigService.testRegistryConnection(id);
      addToast(result.message, result.ok ? 'success' : 'error');
      await load();
    } catch (err) {
      addToast(getApiErrorMessage(err), 'error');
    } finally {
      setTestingId(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await platformConfigService.setDefaultRegistryConfig(id);
      addToast('Registre par défaut défini', 'success');
      await load();
    } catch (err) {
      addToast(getApiErrorMessage(err), 'error');
    }
  };

  const addToast = (message: string, tone: ToastTone) => {
    const id = Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const formData = useMemo(() => {
    if (!selectedRegistry) return undefined;
    return {
      id: selectedRegistry.id,
      name: selectedRegistry.name,
      type: selectedRegistry.type,
      username: selectedRegistry.username,
      password: '',
      registryUrl: selectedRegistry.registryUrl,
      isDefault: selectedRegistry.isDefault,
    };
  }, [selectedRegistry]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuration"
        title="Registres"
        description="Gérez vos registres de conteneurs (Docker Hub, ECR, GCR, etc.)"
        actions={
          dialogMode === null ? (
            <Button icon={<Plus size={14} />} onClick={handleCreateClick}>
              Ajouter un registre
            </Button>
          ) : null
        }
      />

      {error && <Alert variant="error" title="Erreur" message={error} />}

      <div className="space-y-4">
        {toasts.map((toast) => (
          <Alert
            key={toast.id}
            variant={toast.tone === 'success' ? 'success' : 'error'}
            title={toast.tone === 'success' ? 'Succès' : 'Erreur'}
            message={toast.message}
          />
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--text-secondary)]" />
        </div>
      )}

      {!loading && registries.length === 0 && dialogMode === null && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
          <p className="mb-4 text-[var(--text-secondary)]">
            Aucun registre configuré
          </p>
          <Button icon={<Plus size={14} />} onClick={handleCreateClick}>
            Ajouter un registre
          </Button>
        </div>
      )}

      {dialogMode && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <h3 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
            {dialogMode === 'create' ? 'Ajouter un registre' : 'Modifier le registre'}
          </h3>
          <RegistryForm
            initialData={formData}
            mode={dialogMode}
            onSubmit={handleFormSubmit}
            onCancel={() => setDialogMode(null)}
            isSubmitting={isSubmitting}
          />
        </div>
      )}

      {!loading && registries.length > 0 && dialogMode === null && (
        <div className="grid gap-4">
          {registries.map((registry) => (
            <div
              key={registry.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-[var(--bg-secondary)] p-2">
                    <RegistryLogo type={registry.type} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-[var(--text-primary)]">
                      {registry.name}
                    </h4>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {REGISTRY_TYPE_LABELS[registry.type]}
                      {registry.isDefault && (
                        <span className="ml-2 inline-block rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
                          Par défaut
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <ConnectionStatusBadge
                    isConnected={registry.isConnected}
                    error={registry.connectionError}
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Pencil size={12} />}
                  onClick={() => handleEditClick(registry)}
                >
                  Modifier
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={testingId === registry.id}
                  onClick={() => handleTest(registry.id)}
                >
                  {testingId === registry.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : null}
                  Tester
                </Button>

                {!registry.isDefault && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSetDefault(registry.id)}
                  >
                    Définir par défaut
                  </Button>
                )}

                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Trash2 size={12} />}
                  onClick={() => setDeleteId(registry.id)}
                >
                  Supprimer
                </Button>
              </div>

              {registry.connectionError && (
                <div className="mt-3 rounded-md bg-red-500/10 p-3 text-sm text-red-400">
                  <strong>Erreur de connexion:</strong> {registry.connectionError}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        title="Supprimer le registre"
        message="Êtes-vous sûr de vouloir supprimer ce registre? Cette action ne peut pas être annulée."
        isOpen={deleteId !== null}
        onConfirm={() => {
          if (deleteId) void handleDelete(deleteId);
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

function deriveRegistryFromGitlabUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host === 'gitlab.com') {
      return 'registry.gitlab.com';
    }
    return host;
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
}

function extractImageRegistryHost(image: string | null | undefined): string | null {
  if (!image) {
    return null;
  }

  const cleaned = image.trim();
  if (!cleaned) {
    return null;
  }

  const firstPart = cleaned.split('/')[0];
  if (!firstPart || !firstPart.includes('.')) {
    return null;
  }

  return firstPart;
}

export default function RegistrySettingsPage() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<GitlabProvider[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);

  const load = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [providerRows, deploymentRows] = await Promise.all([
        platformConfigService.listGitlabProviders(),
        deploymentsService.getAll(),
      ]);
      setProviders(providerRows);
      setDeployments(deploymentRows);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const providerRegistryHosts = useMemo(() => {
    return Array.from(
      new Set(providers.map((provider) => deriveRegistryFromGitlabUrl(provider.gitlabUrl))),
    ).sort();
  }, [providers]);

  const imageRegistryHosts = useMemo(() => {
    return Array.from(
      new Set(
        deployments
          .map((deployment) => extractImageRegistryHost(deployment.dockerImage))
          .filter((host): host is string => Boolean(host)),
      ),
    ).sort();
  }, [deployments]);

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Settings"
          title="Registry"
          description="Registry visibility is restricted to administrators."
        />
        <Alert tone="warning">
          You do not have permission to view registry settings.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Registry"
        description="Track configured registry hosts and hosts used by deployment images."
        actions={(
          <Button
            variant="secondary"
            icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </Button>
        )}
      />

      {error && <Alert tone="error">{error}</Alert>}

      <SectionCard contentClassName="!p-0">
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--text-secondary)]">Git providers</p>
            <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
              {providers.length}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--text-secondary)]">Provider registry hosts</p>
            <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
              {providerRegistryHosts.length}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--text-secondary)]">Used by images</p>
            <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
              {imageRegistryHosts.length}
            </p>
          </div>
        </div>
      </SectionCard>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--text-secondary)]" />
        </div>
      ) : (
        <>
          <SectionCard
            title="Provider Registries"
            description="Derived from configured GitLab providers."
            actions={(
              <Link
                href="/settings/git"
                className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                Configure Git providers
                <ExternalLink size={12} />
              </Link>
            )}
          >
            {providerRegistryHosts.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">
                No provider registry host detected yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {providerRegistryHosts.map((host) => (
                  <div
                    key={host}
                    className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  >
                    <Database size={14} className="text-[var(--text-secondary)]" />
                    {host}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Image Registry Hosts"
            description="Extracted from deployment docker image tags."
          >
            {imageRegistryHosts.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">
                No deployment image registry host found yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {imageRegistryHosts.map((host) => (
                  <div
                    key={host}
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  >
                    {host}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
