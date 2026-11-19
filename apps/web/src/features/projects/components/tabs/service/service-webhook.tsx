"use client";

import { useState } from "react";
import { Copy, Loader2, Power, RefreshCw, Webhook } from "lucide-react";
import {
  useWebhookStatus,
  useConfigureWebhook,
  useToggleWebhook,
} from "@/features/platform";
import { getApiErrorMessage } from "@/shared/lib/api";
import { SectionCard } from "@/shared/layout/section-card";

/**
 * Carte « Auto-deploy (Webhook) » d'un service. Webhook PAR SERVICE : un push
 * (pipeline réussi) sur le repo déclenche le déploiement ; la BRANCHE choisit
 * l'environnement (toggle Auto-deploy + branche dans l'onglet Variables).
 */
export function ServiceWebhook({
  projectId,
  serviceId,
}: {
  projectId: string;
  serviceId: string;
}) {
  const statusQuery = useWebhookStatus(projectId, serviceId);
  const configureWebhook = useConfigureWebhook(projectId, serviceId);
  const toggleWebhook = useToggleWebhook(projectId, serviceId);

  const status = statusQuery.data ?? null;
  const loading = statusQuery.isLoading;
  const busy = configureWebhook.isPending || toggleWebhook.isPending;
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const error =
    actionError ??
    (statusQuery.error ? getApiErrorMessage(statusQuery.error) : null);

  const configure = async () => {
    setActionError(null);
    try {
      await configureWebhook.mutateAsync();
    } catch (e) {
      setActionError(getApiErrorMessage(e));
    }
  };

  const toggleActive = async () => {
    if (!status?.configured) return;
    setActionError(null);
    try {
      await toggleWebhook.mutateAsync(status.isActive ?? false);
    } catch (e) {
      setActionError(getApiErrorMessage(e));
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponible */
    }
  };

  const primaryBtn =
    "inline-flex items-center gap-1.5 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-50";
  const ghostBtn =
    "inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-50";

  return (
    <SectionCard
      title="Auto-deploy (Webhook)"
      description="A push (successful pipeline) on the repo triggers the deployment. 1 service = 1 webhook; the branch picks the environment."
    >
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      ) : !status?.configured ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            No webhook configured for this service.
          </p>
          <button
            type="button"
            onClick={() => void configure()}
            disabled={busy}
            className={primaryBtn}
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Webhook size={14} />
            )}{" "}
            Enable webhook
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className={
                status.isActive
                  ? "rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400"
                  : "rounded-full border border-[var(--border)] bg-[var(--hover)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]"
              }
            >
              {status.isActive ? "Active" : "Paused"}
            </span>
            {status.provider && (
              <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                {status.provider}
              </span>
            )}
            {status.lastEventAt && (
              <span className="text-xs text-[var(--text-muted)]">
                Last event: {new Date(status.lastEventAt).toLocaleString()}
              </span>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Webhook URL — paste it in GitLab → Settings → Webhooks (Pipeline
              event)
            </label>
            <div className="flex gap-2">
              <input
                readOnly
                value={status.webhookUrl ?? ""}
                className="w-full flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none"
              />
              <button
                type="button"
                onClick={() => void copy(status.webhookUrl ?? "")}
                className={ghostBtn}
              >
                {copied ? (
                  "Copied ✓"
                ) : (
                  <>
                    <Copy size={14} /> Copy
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void toggleActive()}
              disabled={busy}
              className={ghostBtn}
            >
              <Power size={14} /> {status.isActive ? "Pause" : "Resume"}
            </button>
            <button
              type="button"
              onClick={() => void configure()}
              disabled={busy}
              className={ghostBtn}
            >
              <RefreshCw size={14} /> Re-register on the repo
            </button>
          </div>

          <p className="text-xs text-[var(--text-muted)]">
            Then enable <strong>Auto-deploy</strong> + the trigger branch in
            the <strong>Variables</strong> tab.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
