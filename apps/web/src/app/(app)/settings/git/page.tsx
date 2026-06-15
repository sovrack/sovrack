'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { GitBranch, Globe, Info, Plus, Puzzle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ProviderCard } from '@/components/source-providers/provider-card';
import { AddProviderDialog } from '@/components/source-providers/add-provider-dialog';
import { GitLabLogo } from '@/components/source-providers/provider-meta';
import { useAuth } from '@/hooks/auth/use-auth';
import { getApiErrorMessage } from '@/lib/api';
import { platformConfigService } from '@/services/platform-config.service';
import type {
  CreateGitlabProviderPayload,
  GitlabProvider,
  UpdateGitlabProviderPayload,
} from '@/types/platform-config';

/* ─── Toast ─────────────────────────────────────────────────────────────── */

type ToastTone = 'success' | 'error';
type ToastItem = { id: number; message: string; tone: ToastTone };

function Toast({ item, onRemove }: { item: ToastItem; onRemove: (id: number) => void }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-sm transition-all ${
        item.tone === 'success'
          ? 'border-green-500/20 bg-green-500/10 text-green-300'
          : 'border-red-500/20 bg-red-500/10 text-red-300'
      }`}
    >
      <span className="flex-1">{item.message}</span>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="shrink-0 opacity-60 hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}

/* ─── Empty state ────────────────────────────────────────────────────────── */

function EmptyProviders({ isAdmin, onAdd }: { isAdmin: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-app)] py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/10">
        <GitLabLogo className="h-7 w-7" />
      </div>
      <h3 className="text-base font-semibold text-[var(--text-primary)]">
        No Git Providers Connected
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-[var(--text-secondary)]">
        Connect a Git provider to import repositories, trigger pipelines, and enable
        automatic deployments across your projects.
      </p>
      {isAdmin && (
        <Button className="mt-5" onClick={onAdd} icon={<Plus size={14} />}>
          Connect first provider
        </Button>
      )}
    </div>
  );
}

/* ─── Info banner ────────────────────────────────────────────────────────── */

function InfoBanner() {
  return (
    <div className="flex gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-[var(--text-secondary)]">
      <Info size={15} className="mt-0.5 shrink-0 text-blue-400" />
      <div>
        <span className="font-semibold text-[var(--text-primary)]">Global platform integration.</span>{' '}
        Git providers defined here are reusable across all projects. When you connect a repository
        or group to a project, you select which provider to use.
      </div>
    </div>
  );
}

/* ─── Upcoming providers teaser ─────────────────────────────────────────── */

function UpcomingProviders() {
  const upcoming = [
    { name: 'Gitea', icon: '🟢', desc: 'Self-hosted Gitea instances' },
    { name: 'Bitbucket', icon: '🔵', desc: 'Bitbucket Cloud & Server' },
    { name: 'Azure DevOps', icon: '🔷', desc: 'Azure Repos & Pipelines' },
  ];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-4">
        <Puzzle size={14} className="text-[var(--text-muted)]" />
        <p className="text-sm font-semibold text-[var(--text-secondary)]">Coming Soon</p>
      </div>
      <div className="flex flex-wrap gap-0 divide-x divide-[var(--border)]">
        {upcoming.map((p) => (
          <div key={p.name} className="flex min-w-[160px] flex-1 flex-col gap-0.5 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="text-base">{p.icon}</span>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{p.name}</p>
              <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[var(--text-muted)]">
                Soon
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">{p.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Loading skeleton ───────────────────────────────────────────────────── */

function SkeletonLoading() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <div key={i} className="h-40 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--hover)]" />
      ))}
    </div>
  );
}

/* ─── Stats bar ──────────────────────────────────────────────────────────── */

function StatsBar({ providers }: { providers: GitlabProvider[] }) {
  if (providers.length === 0) return null;
  const configured = providers.filter((p) => p.status === 'CONFIGURED').length;
  const withOAuth = providers.filter((p) => p.oauthTokenConfigured).length;
  const withPat = providers.filter((p) => p.adminTokenConfigured).length;
  const defaults = providers.filter((p) => p.isDefault).length;

  return (
    <div className="flex flex-wrap gap-0 divide-x divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--bg-app)]">
      {[
        { icon: <Globe size={13} />, label: 'Total', value: providers.length },
        { icon: null, label: 'Connected', value: configured },
        { icon: null, label: 'OAuth', value: withOAuth },
        { icon: null, label: 'PAT', value: withPat },
        { icon: null, label: 'Default', value: defaults },
      ].map((s) => (
        <div key={s.label} className="flex flex-1 flex-col items-center gap-0.5 px-4 py-3 text-center">
          <p className="text-lg font-bold text-[var(--text-primary)]">{s.value}</p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {s.label}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function GitSettingsPage() {
  const { isAdmin } = useAuth();

  const [providers, setProviders] = useState<GitlabProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editingProvider, setEditingProvider] = useState<GitlabProvider | null>(null);
  const [dialogProviderType, setDialogProviderType] = useState<'GITLAB' | 'GITHUB' | 'GITEA'>('GITLAB');

  const [runningTestId, setRunningTestId] = useState<string | null>(null);
  const [runningOAuthId, setRunningOAuthId] = useState<string | null>(null);
  const [runningDefaultId, setRunningDefaultId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GitlabProvider | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copiedRedirect, setCopiedRedirect] = useState(false);

  const fallbackRedirectUri = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
    return apiBase
      ? `${apiBase}/providers/gitlab/callback`
      : `${window.location.origin}/providers/gitlab/callback`;
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const [gitlabList, githubList, giteaList] = await Promise.allSettled([
        platformConfigService.listGitlabProviders(),
        platformConfigService.listGithubProviders(),
        platformConfigService.listGiteaProviders(),
      ]);
      const gitlab = gitlabList.status === 'fulfilled' ? gitlabList.value.map((p) => ({ ...p, providerType: 'GITLAB' as const })) : [];
      const github = githubList.status === 'fulfilled' ? githubList.value.map((p) => ({ ...p, providerType: 'GITHUB' as const })) : [];
      const gitea = giteaList.status === 'fulfilled' ? giteaList.value.map((p) => ({ ...p, providerType: 'GITEA' as const })) : [];
      setProviders([...gitlab, ...github, ...gitea]);
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void loadProviders(); }, [loadProviders]);

  // Handle OAuth callback query params
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get('oauth');
    if (!oauth) return;

    const msg = params.get('oauth_message');
    showToast(
      msg || (oauth === 'success' ? 'OAuth connected successfully' : 'OAuth connection failed'),
      oauth === 'success' ? 'success' : 'error',
    );

    params.delete('oauth');
    params.delete('oauth_message');
    params.delete('provider_id');
    const q = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
    void loadProviders();
  }, [loadProviders, showToast]);

  const openCreate = (type: 'GITLAB' | 'GITHUB' | 'GITEA' = 'GITLAB') => {
    setDialogProviderType(type);
    setDialogMode('create');
    setEditingProvider(null);
    setDialogError(null);
    setCopiedRedirect(false);
    setDialogOpen(true);
  };

  const openEdit = (provider: GitlabProvider) => {
    setDialogMode('edit');
    setEditingProvider(provider);
    setDialogError(null);
    setCopiedRedirect(false);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setDialogError(null);
  };

  const isGithubProvider = (p: GitlabProvider) => p.providerType === 'GITHUB';
  const isGiteaProvider = (p: GitlabProvider) => p.providerType === 'GITEA';

  const handleSave = async (
    payload: CreateGitlabProviderPayload | UpdateGitlabProviderPayload,
    providerType?: 'GITLAB' | 'GITHUB' | 'GITEA',
  ) => {
    setSaving(true);
    setDialogError(null);
    const type = providerType ?? dialogProviderType;
    try {
      if (dialogMode === 'create') {
        if (type === 'GITHUB') {
          await platformConfigService.createGithubProvider(payload as CreateGitlabProviderPayload);
        } else if (type === 'GITEA') {
          await platformConfigService.createGiteaProvider(payload as CreateGitlabProviderPayload);
        } else {
          await platformConfigService.createGitlabProvider(payload as CreateGitlabProviderPayload);
        }
        showToast('Git provider connected successfully', 'success');
      } else if (editingProvider) {
        if (isGithubProvider(editingProvider)) {
          await platformConfigService.updateGithubProvider(editingProvider.id, payload as UpdateGitlabProviderPayload);
        } else if (isGiteaProvider(editingProvider)) {
          await platformConfigService.updateGiteaProvider(editingProvider.id, payload as UpdateGitlabProviderPayload);
        } else {
          await platformConfigService.updateGitlabProvider(editingProvider.id, payload as UpdateGitlabProviderPayload);
        }
        showToast('Provider updated', 'success');
      }
      await loadProviders();
      closeDialog();
    } catch (err) {
      setDialogError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: string) => {
    setRunningTestId(id);
    try {
      const provider = providers.find((p) => p.id === id);
      if (provider && isGiteaProvider(provider)) {
        showToast('Connection is tested at deploy time for Gitea', 'success');
        return;
      }
      const result = provider && isGithubProvider(provider)
        ? await platformConfigService.testGithubProvider(id)
        : await platformConfigService.testGitlabProvider(id);
      showToast(result.message, result.ok ? 'success' : 'error');
      await loadProviders();
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setRunningTestId(null);
    }
  };

  const handleOAuth = async (id: string) => {
    const provider = providers.find((p) => p.id === id);
    if (provider && isGithubProvider(provider)) {
      showToast('OAuth GitHub non encore disponible — utilisez un PAT', 'error');
      return;
    }
    setRunningOAuthId(id);
    try {
      const start = await platformConfigService.startGitlabOAuthForProvider(id);
      window.location.assign(start.authorizeUrl);
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
      setRunningOAuthId(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    setRunningDefaultId(id);
    try {
      const provider = providers.find((p) => p.id === id);
      if (provider && isGithubProvider(provider)) {
        await platformConfigService.setDefaultGithubProvider(id);
      } else if (provider && isGiteaProvider(provider)) {
        await platformConfigService.setDefaultGiteaProvider(id);
      } else {
        await platformConfigService.setDefaultGitlabProvider(id);
      }
      showToast('Default provider updated', 'success');
      await loadProviders();
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setRunningDefaultId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (isGithubProvider(deleteTarget)) {
        await platformConfigService.deleteGithubProvider(deleteTarget.id);
      } else if (isGiteaProvider(deleteTarget)) {
        await platformConfigService.deleteGiteaProvider(deleteTarget.id);
      } else {
        await platformConfigService.deleteGitlabProvider(deleteTarget.id);
      }
      showToast('Provider removed', 'success');
      setDeleteTarget(null);
      await loadProviders();
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyRedirect = (value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopiedRedirect(true);
      window.setTimeout(() => setCopiedRedirect(false), 1200);
    });
  };

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Settings"
          title="Git Providers"
          description="Global reusable Git integrations. Projects reference these providers to import repositories, trigger builds, and deploy automatically."
          actions={
            isAdmin && (
              <Button onClick={() => openCreate('GITLAB')} icon={<Plus size={14} />}>
                Add provider
              </Button>
            )
          }
        />

        {loading ? (
          <SkeletonLoading />
        ) : (
          <>
            {providers.length === 0 ? (
              <EmptyProviders isAdmin={isAdmin} onAdd={openCreate} />
            ) : (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                    <GitBranch size={14} />
                    Connected Providers
                    <span className="rounded-full border border-[var(--border)] bg-[var(--hover)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">
                      {providers.length}
                    </span>
                  </h2>
                </div>

                {providers.map((p) => (
                  <ProviderCard
                    key={p.id}
                    provider={p}
                    onEdit={openEdit}
                    onDelete={(provider) => setDeleteTarget(provider)}
                    onTest={handleTest}
                    onOAuth={handleOAuth}
                    onSetDefault={handleSetDefault}
                    isAdmin={isAdmin}
                    runningTestId={runningTestId}
                    runningOAuthId={runningOAuthId}
                    runningDefaultId={runningDefaultId}
                  />
                ))}
              </section>
            )}

          </>
        )}
      </div>

      {/* Add / Edit dialog */}
      <AddProviderDialog
        open={dialogOpen}
        mode={dialogMode}
        existingProvider={editingProvider}
        initialProviderType={editingProvider?.providerType ?? dialogProviderType}
        fallbackRedirectUri={fallbackRedirectUri}
        saving={saving}
        error={dialogError}
        copiedRedirect={copiedRedirect}
        onSave={handleSave}
        onClose={closeDialog}
        onCopyRedirectUri={handleCopyRedirect}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Remove "${deleteTarget?.name ?? ''}"?`}
        description="This will remove the provider from the platform. Projects already using it will lose access to pipelines and source operations."
        confirmLabel={deleting ? 'Removing…' : 'Remove provider'}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Toast stack */}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 space-y-2 w-80">
          {toasts.map((t) => (
            <Toast
              key={t.id}
              item={t}
              onRemove={(id) => setToasts((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}
    </>
  );
}
