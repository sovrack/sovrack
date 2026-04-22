'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Star,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/api';
import { platformConfigService } from '@/services/platform-config.service';
import type {
  CreateGitlabProviderPayload,
  GitProviderStatus,
  GitlabProvider,
  UpdateGitlabProviderPayload,
} from '@/types/platform-config';

type ToastTone = 'success' | 'error';
type ToastItem = { id: number; message: string; tone: ToastTone };
type DialogMode = 'create' | 'edit';

type ProviderFormState = {
  id?: string;
  name: string;
  gitlabUrl: string;
  internalUrl: string;
  redirectUri: string;
  applicationId: string;
  applicationSecret: string;
  groupNames: string;
  adminToken: string;
  isDefault: boolean;
  applicationSecretConfigured: boolean;
  adminTokenConfigured: boolean;
  oauthTokenConfigured: boolean;
  oauthExpiresAt: string | null;
};

function GitlabLogo() {
  return (
    <svg viewBox="0 0 380 380" className="h-5 w-5" fill="none">
      <path d="M282.83 170.73l-.27-.69-26.14-68.22a6.81 6.81 0 00-2.69-3.24 7 7 0 00-8 .43 7 7 0 00-2.32 3.52l-17.65 54H154.29l-17.65-54a6.86 6.86 0 00-2.32-3.52 7 7 0 00-8-.43 6.85 6.85 0 00-2.69 3.24L97.44 170l-.26.69a48.54 48.54 0 0016.1 56.1l.09.07.24.17 39.82 29.82 19.7 14.91 12 9.06a8.07 8.07 0 009.76 0l12-9.06 19.7-14.91 40.06-30 .1-.08a48.56 48.56 0 0016.08-56.04z" fill="#E24329"/>
      <path d="M282.83 170.73l-.27-.69a88.3 88.3 0 00-35.15 15.8L190 229.25c19.55 14.79 36.57 27.64 36.57 27.64l40.06-30 .1-.08a48.56 48.56 0 0016.1-56.08z" fill="#FC6D26"/>
      <path d="M153.43 256.89l19.7 14.91 12 9.06a8.07 8.07 0 009.76 0l12-9.06 19.7-14.91S209.55 244 190 229.25c-19.55 14.79-36.57 27.64-36.57 27.64z" fill="#FCA326"/>
      <path d="M132.58 185.84A88.19 88.19 0 0097.44 170l-.26.69a48.54 48.54 0 0016.1 56.1l.09.07.24.17 39.82 29.82s17-12.85 36.57-27.64z" fill="#FC6D26"/>
    </svg>
  );
}

function StatusBadge({ status }: { status: GitProviderStatus }) {
  if (status === 'CONFIGURED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-400">
        <CheckCircle2 size={12} />
        Configured
      </span>
    );
  }

  if (status === 'ACTION_REQUIRED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
        <AlertTriangle size={12} />
        Action Required
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
      <XCircle size={12} />
      Not Configured
    </span>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(parsed);
}

function providerToForm(provider: GitlabProvider): ProviderFormState {
  return {
    id: provider.id,
    name: provider.name,
    gitlabUrl: provider.gitlabUrl,
    internalUrl: provider.internalUrl,
    redirectUri: provider.redirectUri,
    applicationId: provider.applicationId,
    applicationSecret: '',
    groupNames: provider.groupNames,
    adminToken: '',
    isDefault: provider.isDefault,
    applicationSecretConfigured: provider.applicationSecretConfigured,
    adminTokenConfigured: provider.adminTokenConfigured,
    oauthTokenConfigured: provider.oauthTokenConfigured,
    oauthExpiresAt: provider.oauthExpiresAt,
  };
}

function createEmptyForm(fallbackRedirectUri: string): ProviderFormState {
  return {
    name: 'GitLab',
    gitlabUrl: '',
    internalUrl: '',
    redirectUri: fallbackRedirectUri,
    applicationId: '',
    applicationSecret: '',
    groupNames: '',
    adminToken: '',
    isDefault: false,
    applicationSecretConfigured: false,
    adminTokenConfigured: false,
    oauthTokenConfigured: false,
    oauthExpiresAt: null,
  };
}

export default function GitSettingsPage() {
  const { isAdmin } = useAuth();

  const [providers, setProviders] = useState<GitlabProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [form, setForm] = useState<ProviderFormState>(() => createEmptyForm(''));

  const [runningTestId, setRunningTestId] = useState<string | null>(null);
  const [runningOAuthId, setRunningOAuthId] = useState<string | null>(null);
  const [runningDefaultId, setRunningDefaultId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GitlabProvider | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fallbackRedirectUri = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
    if (apiBase) {
      return `${apiBase}/providers/gitlab/callback`;
    }
    return `${window.location.origin.replace(/\/+$/, '')}/providers/gitlab/callback`;
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 2800);
  }, []);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await platformConfigService.listGitlabProviders();
      setProviders(list);
    } catch (loadError) {
      const message = getApiErrorMessage(loadError);
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const oauth = params.get('oauth');
    if (!oauth) return;

    const oauthMessage = params.get('oauth_message');
    if (oauth === 'success') {
      showToast(oauthMessage || 'Connexion OAuth GitLab réussie', 'success');
    } else {
      showToast(oauthMessage || 'Connexion OAuth GitLab échouée', 'error');
    }

    params.delete('oauth');
    params.delete('oauth_message');
    params.delete('provider_id');
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);

    void loadProviders();
  }, [loadProviders, showToast]);

  useEffect(() => {
    if (!dialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDialogOpen(false);
        setError(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialogOpen]);

  const setFormValue = <K extends keyof ProviderFormState>(
    key: K,
    value: ProviderFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openCreateDialog = () => {
    setDialogMode('create');
    setForm(createEmptyForm(fallbackRedirectUri));
    setError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (provider: GitlabProvider) => {
    setDialogMode('edit');
    setForm(providerToForm(provider));
    setError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('Name est requis');
      return;
    }
    if (!form.gitlabUrl.trim()) {
      setError('GitLab URL est requis');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (dialogMode === 'create') {
        const payload: CreateGitlabProviderPayload = {
          name: form.name.trim(),
          gitlabUrl: form.gitlabUrl.trim(),
          internalUrl: form.internalUrl.trim(),
          redirectUri: form.redirectUri.trim(),
          applicationId: form.applicationId.trim(),
          applicationSecret: form.applicationSecret.trim(),
          groupNames: form.groupNames.trim(),
          adminToken: form.adminToken.trim(),
          isDefault: form.isDefault,
        };
        await platformConfigService.createGitlabProvider(payload);
        showToast('Provider GitLab créé', 'success');
      } else {
        if (!form.id) {
          setError('Provider invalide');
          return;
        }

        const payload: UpdateGitlabProviderPayload = {
          name: form.name.trim(),
          gitlabUrl: form.gitlabUrl.trim(),
          internalUrl: form.internalUrl.trim(),
          redirectUri: form.redirectUri.trim(),
          applicationId: form.applicationId.trim(),
          groupNames: form.groupNames.trim(),
          isDefault: form.isDefault,
        };

        if (form.applicationSecret.trim()) {
          payload.applicationSecret = form.applicationSecret.trim();
        }

        if (form.adminToken.trim()) {
          payload.adminToken = form.adminToken.trim();
        }

        await platformConfigService.updateGitlabProvider(form.id, payload);
        showToast('Provider GitLab mis à jour', 'success');
      }

      await loadProviders();
      closeDialog();
    } catch (saveError) {
      const message = getApiErrorMessage(saveError);
      setError(message);
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestProvider = async (providerId: string) => {
    setRunningTestId(providerId);
    setError(null);
    try {
      const result = await platformConfigService.testGitlabProvider(providerId);
      showToast(result.message, result.ok ? 'success' : 'error');
      await loadProviders();
    } catch (testError) {
      const message = getApiErrorMessage(testError);
      showToast(message, 'error');
    } finally {
      setRunningTestId(null);
    }
  };

  const handleConnectOAuth = async (providerId: string) => {
    setRunningOAuthId(providerId);
    setError(null);
    try {
      const start = await platformConfigService.startGitlabOAuthForProvider(providerId);
      window.location.assign(start.authorizeUrl);
    } catch (oauthError) {
      const message = getApiErrorMessage(oauthError);
      setError(message);
      showToast(message, 'error');
      setRunningOAuthId(null);
    }
  };

  const handleSetDefault = async (providerId: string) => {
    setRunningDefaultId(providerId);
    setError(null);
    try {
      await platformConfigService.setDefaultGitlabProvider(providerId);
      showToast('Provider défini par défaut', 'success');
      await loadProviders();
    } catch (defaultError) {
      const message = getApiErrorMessage(defaultError);
      setError(message);
      showToast(message, 'error');
    } finally {
      setRunningDefaultId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await platformConfigService.deleteGitlabProvider(deleteTarget.id);
      showToast('Provider supprimé', 'success');
      setDeleteTarget(null);
      await loadProviders();
    } catch (deleteError) {
      const message = getApiErrorMessage(deleteError);
      setError(message);
      showToast(message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-[var(--hover)]" />
        <div className="h-40 animate-pulse rounded-2xl bg-[var(--hover)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="GitLab Providers"
        description="Manage multiple GitLab providers with status, OAuth, and secure credentials."
      />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-5">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
              GitLab Integration
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              This platform supports multiple GitLab providers.
            </p>
          </div>
          {isAdmin && (
            <Button onClick={openCreateDialog} icon={<Plus size={14} />}>
              Add provider
            </Button>
          )}
        </div>

        <div className="space-y-3 p-6">
          {providers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-app)] py-14">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                <GitlabLogo />
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                No GitLab provider configured.
              </p>
              {isAdmin && (
                <Button className="mt-4" onClick={openCreateDialog}>
                  Configure first provider
                </Button>
              )}
            </div>
          ) : (
            providers.map((provider) => (
              <div
                key={provider.id}
                className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-4 md:flex-row md:items-center"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => openEditDialog(provider)}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                    <GitlabLogo />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {provider.name}
                    </p>
                    <p className="truncate text-xs text-[var(--text-secondary)]">
                      {provider.gitlabUrl}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      Updated {formatDateTime(provider.updatedAt)}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      {provider.oauthTokenConfigured
                        ? `OAuth connected${provider.oauthExpiresAt ? ` • expires ${formatDateTime(provider.oauthExpiresAt)}` : ''}`
                        : 'OAuth not connected'}
                    </p>
                  </div>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  {provider.isDefault && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                      <Star size={12} />
                      Default
                    </span>
                  )}
                  <StatusBadge status={provider.status} />

                  {isAdmin && !provider.isDefault && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={runningDefaultId === provider.id}
                      onClick={() => void handleSetDefault(provider.id)}
                    >
                      Set default
                    </Button>
                  )}

                  {isAdmin && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={runningOAuthId === provider.id}
                      onClick={() => void handleConnectOAuth(provider.id)}
                    >
                      Connect OAuth
                    </Button>
                  )}

                  {isAdmin && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={runningTestId === provider.id}
                      onClick={() => void handleTestProvider(provider.id)}
                      icon={<ShieldCheck size={13} />}
                    >
                      Test
                    </Button>
                  )}

                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Pencil size={13} />}
                      onClick={() => openEditDialog(provider)}
                    >
                      Edit
                    </Button>
                  )}

                  {isAdmin && (
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<Trash2 size={13} />}
                      onClick={() => setDeleteTarget(provider)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={closeDialog} aria-hidden />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="gitlab-provider-dialog-title"
            className="relative z-10 max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-app)]">
                <GitlabLogo />
              </div>
              <div>
                <p id="gitlab-provider-dialog-title" className="text-sm font-semibold text-[var(--text-primary)]">
                  {dialogMode === 'create' ? 'Add GitLab Provider' : 'Edit GitLab Provider'}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Configure OAuth credentials and provider access.
                </p>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                className="ml-auto rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-5 p-6">
              {error && <Alert tone="error">{error}</Alert>}

              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-4 text-sm text-[var(--text-secondary)]">
                <p className="font-semibold text-[var(--text-primary)]">
                  Setup flow
                </p>
                <p className="mt-1">
                  1. Create a GitLab OAuth application with scopes:
                  <span className="ml-1 font-mono">api, read_user, read_repository</span>.
                </p>
                <p className="mt-1">
                  2. Use redirect URI shown below.
                </p>
                <p className="mt-1">
                  3. Save provider, then click Connect OAuth.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) => setFormValue('name', event.target.value)}
                    placeholder="my-account"
                    disabled={!isAdmin}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                    Default provider
                  </label>
                  <label className="flex h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={form.isDefault}
                      onChange={(event) => setFormValue('isDefault', event.target.checked)}
                      disabled={!isAdmin}
                      className="accent-zinc-500"
                    />
                    Set as default
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                    GitLab URL <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.gitlabUrl}
                    onChange={(event) => setFormValue('gitlabUrl', event.target.value)}
                    placeholder="https://gitlab.com"
                    disabled={!isAdmin}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                    Internal URL
                  </label>
                  <input
                    type="text"
                    value={form.internalUrl}
                    onChange={(event) => setFormValue('internalUrl', event.target.value)}
                    placeholder="http://gitlab:80"
                    disabled={!isAdmin}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                  Redirect URI
                </label>
                <input
                  type="text"
                  value={form.redirectUri || fallbackRedirectUri}
                  onChange={(event) => setFormValue('redirectUri', event.target.value)}
                  disabled={!isAdmin}
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                    Application ID
                  </label>
                  <input
                    type="text"
                    value={form.applicationId}
                    onChange={(event) => setFormValue('applicationId', event.target.value)}
                    placeholder="Application ID"
                    disabled={!isAdmin}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                    Application Secret
                  </label>
                  <input
                    type="password"
                    value={form.applicationSecret}
                    onChange={(event) => setFormValue('applicationSecret', event.target.value)}
                    placeholder={
                      form.applicationSecretConfigured
                        ? '••••••••  (leave empty to keep current)'
                        : 'Application Secret'
                    }
                    disabled={!isAdmin}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                    Group Names
                  </label>
                  <input
                    type="text"
                    value={form.groupNames}
                    onChange={(event) => setFormValue('groupNames', event.target.value)}
                    placeholder="my-org,dev-team"
                    disabled={!isAdmin}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                    Admin Token
                  </label>
                  <input
                    type="password"
                    value={form.adminToken}
                    onChange={(event) => setFormValue('adminToken', event.target.value)}
                    placeholder={
                      form.adminTokenConfigured
                        ? '••••••••  (leave empty to keep current)'
                        : 'glpat-xxxxxxxxxxxxxxxx'
                    }
                    disabled={!isAdmin}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm font-mono text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-50"
                  />
                </div>
              </div>

              {form.id && (
                <p className="text-xs text-[var(--text-secondary)]">
                  OAuth status: {form.oauthTokenConfigured ? 'Connected' : 'Not connected'}
                  {form.oauthExpiresAt ? ` • expires ${formatDateTime(form.oauthExpiresAt)}` : ''}
                </p>
              )}

              {isAdmin ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button onClick={() => void handleSave()} disabled={saving}>
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    {dialogMode === 'create' ? 'Create provider' : 'Save changes'}
                  </Button>

                  {dialogMode === 'edit' && form.id && (
                    <Button
                      variant="secondary"
                      loading={runningOAuthId === form.id}
                      onClick={() => void handleConnectOAuth(form.id!)}
                    >
                      Connect OAuth
                    </Button>
                  )}

                  {dialogMode === 'edit' && form.id && (
                    <Button
                      variant="secondary"
                      loading={runningTestId === form.id}
                      onClick={() => void handleTestProvider(form.id!)}
                      icon={<ShieldCheck size={13} />}
                    >
                      Test connection
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-secondary)]">
                  Contact an administrator to manage providers.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete GitLab provider"
        description={`Delete provider "${deleteTarget?.name ?? ''}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          if (deleting) return;
          setDeleteTarget(null);
        }}
      />

      <div className="pointer-events-none fixed right-4 top-4 z-[100] space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              toast.tone === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
