"use client";

import { useState } from "react";
import { ExternalLink, Globe, Loader2, Plus, Trash2 } from "lucide-react";
import {
  useServiceDomains,
  useCreateDomain,
  useDeleteDomain,
} from "@/features/platform";
import { getApiErrorMessage } from "@/shared/lib/api";
import { SectionCard } from "@/shared/layout/section-card";

/**
 * Domaines d'UNE instance (service × environnement). Rattacher un domaine ici =
 * l'executor pose la route Traefik HTTPS vers ce conteneur au prochain déploiement.
 */
export function ServiceDomains({
  projectId,
  serviceEnvId,
  envName,
  envsLoading,
}: {
  projectId: string;
  serviceEnvId: string | null;
  envName?: string;
  envsLoading?: boolean;
}) {
  const domainsQuery = useServiceDomains(serviceEnvId);
  const createDomain = useCreateDomain(serviceEnvId);
  const deleteDomain = useDeleteDomain(serviceEnvId);

  const domains = domainsQuery.data ?? [];
  const loading = domainsQuery.isLoading;
  const adding = createDomain.isPending;
  const [name, setName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const error =
    actionError ??
    (domainsQuery.error ? getApiErrorMessage(domainsQuery.error) : null);

  const add = async () => {
    if (!serviceEnvId || !name.trim()) return;
    setActionError(null);
    try {
      await createDomain.mutateAsync({ name: name.trim(), projectId });
      setName("");
    } catch (e) {
      setActionError(getApiErrorMessage(e));
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    setActionError(null);
    try {
      await deleteDomain.mutateAsync(id);
    } catch (e) {
      setActionError(getApiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SectionCard
      title="Domaines & Certificats SSL"
      description={`Attachez un domaine ou un sous-domaine wildcard (*.mondomaine.com) à ce service${envName ? ` (${envName})` : ""}. Traefik route automatiquement le trafic avec certificat SSL Let's Encrypt (HTTP-01 ou DNS-01).`}
    >
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

      {!serviceEnvId ? (
        envsLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={14} className="animate-spin" /> Loading environments…
          </p>
        ) : (
          <p className="text-sm text-muted">
            Link this service to an environment first (the &quot;Environments
            &amp; variables&quot; tab).
          </p>
        )
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
              }}
              placeholder="app.mydomain.com"
              className="w-full flex-1 rounded-lg border border-border bg-app px-3 py-2 font-mono text-sm text-primary outline-none focus:border-muted"
            />
            <button
              type="button"
              onClick={() => void add()}
              disabled={adding || !name.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover disabled:opacity-50"
            >
              {adding ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}{" "}
              Add
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : domains.length === 0 ? (
            <p className="text-sm text-muted">
              No domains yet. Add one above.
            </p>
          ) : (
            <ul className="space-y-2">
              {domains.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <Globe size={14} className="text-muted" />
                    <a
                      href={`https://${d.name}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      {d.name} <ExternalLink size={11} />
                    </a>
                    {d.name.startsWith("*") && (
                      <span className="rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-400">
                        Wildcard (DNS-01)
                      </span>
                    )}
                    {d.verified && (
                      <span className="rounded-md border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                        verified
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => void remove(d.id)}
                    disabled={busyId === d.id}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-500/20 text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                    aria-label={`Delete ${d.name}`}
                  >
                    {busyId === d.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-muted">
            The domain must point (DNS A/CNAME) to the environment&apos;s
            server, and the platform must be publicly reachable for the
            Let&apos;s Encrypt certificate.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
