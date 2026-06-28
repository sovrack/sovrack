'use client';

import { useState } from 'react';
import { Loader2, RefreshCw, ScrollText, Search } from 'lucide-react';
import { useServiceLogs } from '@/features/monitoring';
import { getApiErrorMessage } from '@/shared/lib/api';
import { SectionCard } from '@/shared/layout/section-card';

const PERIODS = [
  { label: '15 min', minutes: 15 },
  { label: '1 h', minutes: 60 },
  { label: '24 h', minutes: 60 * 24 },
  { label: '7 j', minutes: 60 * 24 * 7 },
];

/**
 * Recherche dans les logs HISTORIQUES (Loki) d'une instance service×env.
 * Dégradation gracieuse : si Loki n'est pas configuré, on invite à installer la
 * stack monitoring (action « install_loki ») — le tail live reste dispo ailleurs.
 */
export function ServiceLogs({ serviceEnvId }: { serviceEnvId: string | null }) {
  const [minutes, setMinutes] = useState(60);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const query = useServiceLogs(serviceEnvId, {
    fromMinutes: minutes,
    search,
    limit: 1000,
  });
  const data = query.data;

  if (!serviceEnvId) {
    return (
      <SectionCard title="Logs (historique)">
        <p className="text-sm text-[var(--text-muted)]">
          Liez d&apos;abord ce service à un environnement pour consulter ses logs.
        </p>
      </SectionCard>
    );
  }

  const pillBase =
    'rounded-lg border px-3 py-1.5 text-xs font-medium transition';
  const pillActive =
    'border-[var(--text-primary)] bg-[var(--hover)] text-[var(--text-primary)]';
  const pillIdle =
    'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]';

  return (
    <SectionCard
      title="Logs (historique)"
      description="Recherche dans les logs runtime centralisés (Loki), par période. Filtre par instance service × environnement."
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.minutes}
              type="button"
              onClick={() => setMinutes(p.minutes)}
              className={`${pillBase} ${minutes === p.minutes ? pillActive : pillIdle}`}
            >
              {p.label}
            </button>
          ))}

          <div className="relative min-w-[200px] flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setSearch(searchInput); }}
              placeholder="Filtrer les lignes…"
              className="h-9 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
            />
          </div>

          <button
            type="button"
            onClick={() => { setSearch(searchInput); void query.refetch(); }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            <RefreshCw size={14} /> Rechercher
          </button>
        </div>

        {query.isLoading && (
          <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 size={14} className="animate-spin" /> Chargement…
          </p>
        )}

        {query.error && (
          <p className="text-xs text-red-400">{getApiErrorMessage(query.error)}</p>
        )}

        {data && !data.configured && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
            Loki n&apos;est pas configuré. Installez la stack de logs centralisés
            (Automation → action <strong>« Installer Loki »</strong>) pour activer
            la recherche historique. En attendant, l&apos;onglet
            {' '}<strong>Deployments</strong> affiche le tail live du conteneur.
          </div>
        )}

        {data && data.configured && !data.reachable && (
          <p className="text-xs text-red-400">{data.message ?? 'Loki injoignable.'}</p>
        )}

        {data && data.configured && data.reachable && (
          data.entries.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              Aucun log sur cette période{search ? ' pour ce filtre' : ''}.
            </p>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-3 font-mono text-xs">
              <div className="mb-2 flex items-center gap-2 font-sans text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <ScrollText size={12} /> {data.total} ligne{data.total !== 1 ? 's' : ''}
              </div>
              {data.entries.map((e, i) => (
                <div key={`${e.ts}-${i}`} className="flex gap-3 py-0.5">
                  <span className="shrink-0 text-[var(--text-muted)]">
                    {new Date(e.ts).toLocaleTimeString()}
                  </span>
                  <span className="whitespace-pre-wrap break-all text-[var(--text-primary)]">
                    {e.line}
                  </span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </SectionCard>
  );
}
