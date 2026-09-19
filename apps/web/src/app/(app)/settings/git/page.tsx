"use client";

import { useEffect, useMemo, useState } from "react";
import { GitBranch, Plus } from "lucide-react";
import { PageHeader } from "@/shared/layout/page-header";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { ProviderCard } from "@/features/source-providers/components/provider-card";
import { AddProviderDialog } from "@/features/source-providers/components/add-provider-dialog";
import {
  GitHubLogo,
  GitLabLogo,
} from "@/features/source-providers/components/provider-meta";
import { useAuth } from "@/features/auth/api/use-auth";
import { getApiErrorMessage } from "@/shared/lib/api";
import { useToasts, type ToastItem } from "@/shared/hooks/use-toasts";
import { useGitProviders, useReloadGitProviders } from "@/features/platform";
import { platformConfigService } from "@/features/platform/api/platform-config.service";
import type {
  CreateGitlabProviderPayload,
  GitlabProvider,
  UpdateGitlabProviderPayload,
} from "@/features/platform/types/platform-config";

/* ─── Toast ─────────────────────────────────────────────────────────────── */

function Toast({
  item,
  onRemove,
}: {
  item: ToastItem;
  onRemove: (id: number) => void;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-sm transition-all ${
        item.tone === "success"
          ? "border-green-500/20 bg-green-500/10 text-green-300"
          : "border-red-500/20 bg-red-500/10 text-red-300"
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

function EmptyProviders({
  isAdmin,
  onAdd,
}: {
  isAdmin: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-app)] py-16 text-center">
      <div className="mb-4 flex items-center gap-2">
        <span
          role="img"
          aria-label="GitLab"
          className="flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/10"
        >
          <GitLabLogo className="h-7 w-7" />
        </span>
        <span
          role="img"
          aria-label="GitHub"
          className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-500/25 bg-zinc-500/10 text-[var(--text-primary)]"
        >
          <GitHubLogo className="h-7 w-7" />
        </span>
      </div>
      <h3 className="text-base font-semibold text-[var(--text-primary)]">
        Aucun fournisseur Git connecté
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-[var(--text-secondary)]">
        Connectez GitHub ou GitLab pour importer vos dépôts, déclencher les
        pipelines et automatiser les déploiements de vos projets.
      </p>
      {isAdmin && (
        <Button className="mt-5" onClick={onAdd} icon={<Plus size={14} />}>
          Connecter un fournisseur
        </Button>
      )}
    </div>
  );
}

/* ─── Loading skeleton ───────────────────────────────────────────────────── */

function SkeletonLoading() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--hover)]"
        />
      ))}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function GitSettingsPage() {
  const { isAdmin } = useAuth();

  const providersQuery = useGitProviders();
  const reloadProviders = useReloadGitProviders();
  const providers = useMemo(
    () => providersQuery.data ?? [],
    [providersQuery.data],
  );
  const loading = providersQuery.isLoading;
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const { toasts, showToast, dismiss: dismissToast } = useToasts(3000);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingProvider, setEditingProvider] = useState<GitlabProvider | null>(
    null,
  );
  const [dialogProviderType, setDialogProviderType] = useState<
    "GITLAB" | "GITHUB"
  >("GITLAB");

  const [runningTestId, setRunningTestId] = useState<string | null>(null);
  const [runningOAuthId, setRunningOAuthId] = useState<string | null>(null);
  const [runningDefaultId, setRunningDefaultId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GitlabProvider | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copiedRedirect, setCopiedRedirect] = useState(false);

  // Must match GitProviderOauthService's own fallback exactly
  // (`${callbackBaseUrl}/gitlab/callback` — backend/.../git-provider-oauth.service.ts,
  // resolveGitlabProviderRedirectUri) — that's the real, working route
  // (`@Controller('gitlab')` + `@Get('callback')`, confirmed live: 302).
  // The previous `/providers/gitlab/callback` segment never existed on the
  // backend (404, confirmed live) — see AUDIT_VERIFICATION_UI.md Point 2.
  const fallbackRedirectUri = useMemo(() => {
    if (typeof window === "undefined") return "";
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
    if (apiBase) return `${apiBase}/gitlab/callback`;
    // NEXT_PUBLIC_API_URL not set: derive backend origin from current hostname +
    // default backend port 3001. This is only a UI hint — set NEXT_PUBLIC_API_URL
    // in production so the correct URL is shown without guessing.
    const backendOrigin = `${window.location.protocol}//${window.location.hostname}:3001`;
    return `${backendOrigin}/gitlab/callback`;
  }, []);

  // Handle OAuth callback query params
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("oauth");
    if (!oauth) return;

    const msg = params.get("oauth_message");
    showToast(
      msg ||
        (oauth === "success"
          ? "Connexion OAuth réussie"
          : "Échec de la connexion OAuth"),
      oauth === "success" ? "success" : "error",
    );

    params.delete("oauth");
    params.delete("oauth_message");
    params.delete("provider_id");
    const q = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${q ? `?${q}` : ""}`,
    );
    void reloadProviders();
  }, [reloadProviders, showToast]);

  const openCreate = (type: "GITLAB" | "GITHUB" = "GITLAB") => {
    setDialogProviderType(type);
    setDialogMode("create");
    setEditingProvider(null);
    setDialogError(null);
    setCopiedRedirect(false);
    setDialogOpen(true);
  };

  const openEdit = (provider: GitlabProvider) => {
    setDialogMode("edit");
    setEditingProvider(provider);
    setDialogError(null);
    setCopiedRedirect(false);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setDialogError(null);
  };

  const isGithubProvider = (p: GitlabProvider) => p.providerType === "GITHUB";

  const handleSave = async (
    payload: CreateGitlabProviderPayload | UpdateGitlabProviderPayload,
    providerType?: "GITLAB" | "GITHUB",
  ) => {
    setSaving(true);
    setDialogError(null);
    const type = providerType ?? dialogProviderType;
    try {
      if (dialogMode === "create") {
        if (type === "GITHUB") {
          await platformConfigService.createGithubProvider(
            payload as CreateGitlabProviderPayload,
          );
        } else {
          await platformConfigService.createGitlabProvider(
            payload as CreateGitlabProviderPayload,
          );
        }
        showToast("Fournisseur Git connecté", "success");
      } else if (editingProvider) {
        if (isGithubProvider(editingProvider)) {
          await platformConfigService.updateGithubProvider(
            editingProvider.id,
            payload as UpdateGitlabProviderPayload,
          );
        } else {
          await platformConfigService.updateGitlabProvider(
            editingProvider.id,
            payload as UpdateGitlabProviderPayload,
          );
        }
        showToast("Fournisseur mis à jour", "success");
      }
      await reloadProviders();
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
      const result =
        provider && isGithubProvider(provider)
          ? await platformConfigService.testGithubProvider(id)
          : await platformConfigService.testGitlabProvider(id);
      showToast(result.message, result.ok ? "success" : "error");
      await reloadProviders();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setRunningTestId(null);
    }
  };

  const handleOAuth = async (id: string) => {
    const provider = providers.find((p) => p.id === id);
    if (provider && isGithubProvider(provider)) {
      showToast(
        "OAuth GitHub non encore disponible — utilisez un PAT",
        "error",
      );
      return;
    }
    setRunningOAuthId(id);
    try {
      const start = await platformConfigService.startGitlabOAuthForProvider(id);
      window.location.assign(start.authorizeUrl);
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
      setRunningOAuthId(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    setRunningDefaultId(id);
    try {
      const provider = providers.find((p) => p.id === id);
      if (provider && isGithubProvider(provider)) {
        await platformConfigService.setDefaultGithubProvider(id);
      } else {
        await platformConfigService.setDefaultGitlabProvider(id);
      }
      showToast("Fournisseur par défaut mis à jour", "success");
      await reloadProviders();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
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
      } else {
        await platformConfigService.deleteGitlabProvider(deleteTarget.id);
      }
      showToast("Fournisseur supprimé", "success");
      setDeleteTarget(null);
      await reloadProviders();
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
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
          eyebrow="Intégrations"
          title="Fournisseurs Git"
          description="Connexions Git réutilisables par les projets pour importer les dépôts, lancer les builds et déployer automatiquement."
          actions={
            isAdmin && (
              <Button
                onClick={() => openCreate("GITLAB")}
                icon={<Plus size={14} />}
              >
                Ajouter un fournisseur
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
                    Fournisseurs connectés
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
        initialProviderType={
          ((editingProvider?.providerType ?? dialogProviderType) === "GITHUB"
            ? "GITHUB"
            : "GITLAB") as "GITLAB" | "GITHUB"
        }
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
        title={`Supprimer « ${deleteTarget?.name ?? ""} » ?`}
        description="Le fournisseur sera supprimé de cet espace. Les projets qui l’utilisent perdront l’accès aux pipelines et aux opérations sur les sources."
        confirmLabel={deleting ? "Suppression…" : "Supprimer le fournisseur"}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Toast stack */}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 space-y-2 w-80">
          {toasts.map((t) => (
            <Toast key={t.id} item={t} onRemove={dismissToast} />
          ))}
        </div>
      )}
    </>
  );
}
