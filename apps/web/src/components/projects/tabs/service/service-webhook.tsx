'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2, Power, RefreshCw, Webhook } from 'lucide-react';
import { webhooksService, type WebhookStatus } from '@/services/webhooks.service';
import { getApiErrorMessage } from '@/lib/api';
import { SectionCard } from '@/components/layout/section-card';

/**
 * Carte « Auto-deploy (Webhook) » d'un service. Webhook PAR SERVICE : un push
 * (pipeline réussi) sur le repo déclenche le déploiement ; la BRANCHE choisit
 * l'environnement (toggle Auto-deploy + branche dans l'onglet Environments).
 */
export function ServiceWebhook({ projectId, serviceId }: { projectId: string; serviceId: string }) {
  const [status, setStatus] = useState<WebhookStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setStatus(await webhooksService.status(projectId, serviceId)); }
    catch (e) { setError(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  }, [projectId, serviceId]);
  useEffect(() => { void load(); }, [load]);

  const configure = async () => {
    setBusy(true); setError(null);
    try { await webhooksService.configure(projectId, serviceId); await load(); }
    catch (e) { setError(getApiErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const toggleActive = async () => {
    if (!status?.configured) return;
    setBusy(true); setError(null);
    try {
      if (status.isActive) await webhooksService.pause(projectId, serviceId);
      else await webhooksService.resume(projectId, serviceId);
      await load();
    } catch (e) { setError(getApiErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* clipboard indisponible */ }
  };

  const primaryBtn = 'inline-flex items-center gap-1.5 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-50';
  const ghostBtn = 'inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-50';

  return (
    <SectionCard
      title="Auto-deploy (Webhook)"
      description="Un push (pipeline réussi) sur le repo déclenche le déploiement. 1 service = 1 webhook ; la branche choisit l'environnement."
    >
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Chargement…</p>
      ) : !status?.configured ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">Aucun webhook configuré pour ce service.</p>
          <button type="button" onClick={() => void configure()} disabled={busy} className={primaryBtn}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Webhook size={14} />} Activer le webhook
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={status.isActive
              ? 'rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400'
              : 'rounded-full border border-[var(--border)] bg-[var(--hover)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]'}>
              {status.isActive ? 'Actif' : 'En pause'}
            </span>
            {status.provider && <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{status.provider}</span>}
            {status.lastEventAt && (
              <span className="text-xs text-[var(--text-muted)]">Dernier event : {new Date(status.lastEventAt).toLocaleString()}</span>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              URL du webhook — à coller dans GitLab → Settings → Webhooks (événement « Pipeline »)
            </label>
            <div className="flex gap-2">
              <input readOnly value={status.webhookUrl ?? ''}
                className="w-full flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none" />
              <button type="button" onClick={() => void copy(status.webhookUrl ?? '')} className={ghostBtn}>
                {copied ? 'Copié ✓' : <><Copy size={14} /> Copier</>}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void toggleActive()} disabled={busy} className={ghostBtn}>
              <Power size={14} /> {status.isActive ? 'Mettre en pause' : 'Réactiver'}
            </button>
            <button type="button" onClick={() => void configure()} disabled={busy} className={ghostBtn}>
              <RefreshCw size={14} /> Ré-enregistrer sur le repo
            </button>
          </div>

          <p className="text-xs text-[var(--text-muted)]">
            Activez ensuite <strong>Auto-deploy</strong> + la branche par environnement dans l&apos;onglet <strong>Environments &amp; variables</strong>.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
