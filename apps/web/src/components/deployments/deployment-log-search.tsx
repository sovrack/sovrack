'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { deploymentsService } from '@/services/deployments.service';
import { getApiErrorMessage } from '@/lib/api';

type Level = 'ALL' | 'INFO' | 'WARN' | 'ERROR';
type Hit = { lineNumber: number; level: 'INFO' | 'WARN' | 'ERROR'; message: string };

const LEVELS: Level[] = ['ALL', 'INFO', 'WARN', 'ERROR'];
const LEVEL_COLOR: Record<Hit['level'], string> = {
  INFO: 'text-[var(--text-muted)]',
  WARN: 'text-amber-400',
  ERROR: 'text-red-400',
};

function highlight(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="rounded bg-yellow-400/30 text-[var(--text-primary)]">{part}</mark>
      : part,
  );
}

/**
 * Searchable view over a deployment's persisted logs. Calls
 * GET /deployments/:id/logs/search (debounced) and highlights matches.
 */
export function DeploymentLogSearch({ deploymentId }: { deploymentId: string }) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<Level>('ALL');
  const [hits, setHits] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = query.trim().length > 0 || level !== 'ALL';
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) {
      setHits([]);
      setTotal(0);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLoading(true);
      setError(null);
      deploymentsService
        .searchLogs(deploymentId, query.trim(), level)
        .then((res) => {
          setHits(res.hits);
          setTotal(res.total);
        })
        .catch((err) => setError(getApiErrorMessage(err)))
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [deploymentId, query, level, active]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search logs…"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-2 pl-9 pr-8 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as Level)}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      {active && (
        <div className="rounded-lg border border-[var(--border)] bg-black/40">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)]">
            <span>{loading ? 'Searching…' : `${total} match${total === 1 ? '' : 'es'}`}{total > hits.length ? ` (showing ${hits.length})` : ''}</span>
          </div>
          {error ? (
            <p className="px-3 py-2 text-xs text-red-400">{error}</p>
          ) : (
            <ul className="max-h-72 overflow-auto p-2 font-mono text-xs leading-relaxed">
              {hits.length === 0 && !loading ? (
                <li className="px-1 py-1 text-[var(--text-muted)]">No matching lines.</li>
              ) : (
                hits.map((h) => (
                  <li key={h.lineNumber} className="flex gap-2 px-1 py-0.5">
                    <span className="shrink-0 select-none text-[var(--text-muted)]">{h.lineNumber}</span>
                    <span className={`shrink-0 select-none ${LEVEL_COLOR[h.level]}`}>{h.level}</span>
                    <span className="whitespace-pre-wrap break-all text-green-300">{highlight(h.message, query)}</span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
