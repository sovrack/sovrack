'use client';

import { useState } from 'react';
import { ExternalLink, Globe, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  useServiceDomains,
  useCreateDomain,
  useDeleteDomain,
} from '@/features/platform';
import { getApiErrorMessage } from '@/shared/lib/api';
import { SectionCard } from '@/shared/layout/section-card';

/**
 * Domaines d'UNE instance (service × environnement). Rattacher un domaine ici =
 * l'executor pose la route Traefik HTTPS vers ce conteneur au prochain déploiement.
 */
export function ServiceDomains({
  projectId,
  serviceEnvId,
  envName,
}: {
  projectId: string;
  serviceEnvId: string | null;
  envName?: string;
}) {
  const domainsQuery = useServiceDomains(serviceEnvId);
  const createDomain = useCreateDomain(serviceEnvId);
  const deleteDomain = useDeleteDomain(serviceEnvId);

  const domains = domainsQuery.data ?? [];
  const loading = domainsQuery.isLoading;
  const adding = createDomain.isPending;
  const [name, setName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const error =
    actionError ?? (domainsQuery.error ? getApiErrorMessage(domainsQuery.error) : null);

  const add = async () => {
    if (!serviceEnvId || !name.trim()) return;
    setActionError(null);
    try {
      await createDomain.mutateAsync({ name: name.trim(), projectId });
      setName('');
    } catch (e) { setActionError(getApiErrorMessage(e)); }
  };

  const remove = async (id: string) => {
    setBusyId(id); setActionError(null);
    try { await deleteDomain.mutateAsync(id); }
    catch (e) { setActionError(getApiErrorMessage(e)); }
    finally { setBusyId(null); }
  };

  return (
    <SectionCard
      title="Domaines (HTTPS)"
      description={`Rattachez un domaine à ce service${envName ? ` (${envName})` : ''}. Au prochain déploiement, Traefik route ${'<domaine>'} → le conteneur, en HTTPS (Let's Encrypt).`}
    >
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

      {!serviceEnvId ? (
        <p className="text-sm text-[var(--text-muted)]">
          Liez d&apos;abord ce service à un environnement (onglet « Environments &amp; variables »).
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
              placeholder="app.mondomaine.com"
              className="w-full flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
            />
            <button type="button" onClick={() => void add()} disabled={adding || !name.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-50">
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Ajouter
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">Chargement…</p>
          ) : domains.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Aucun domaine. Ajoutez-en un ci-dessus.</p>
          ) : (
            <ul className="space-y-2">
              {domains.map((d) => (
                <li key={d.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
                  <span className="flex items-center gap-2 text-sm">
                    <Globe size={14} className="text-[var(--text-muted)]" />
                    <a href={`https://${d.name}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-[var(--text-primary)] hover:underline">
                      {d.name} <ExternalLink size={11} />
                    </a>
                    {d.verified && (
                      <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">vérifié</span>
                    )}
                  </span>
                  <button type="button" onClick={() => void remove(d.id)} disabled={busyId === d.id}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-500/20 text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                    aria-label={`Supprimer ${d.name}`}>
                    {busyId === d.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-[var(--text-muted)]">
            Le domaine doit pointer (DNS A/CNAME) vers le serveur de l&apos;environnement, et la
            plateforme doit être joignable publiquement pour le certificat Let&apos;s Encrypt.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
