'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Globe, Loader2, Pencil, Save, X } from 'lucide-react';
import { environmentsService } from '@/services/environments.service';
import { getApiErrorMessage } from '@/lib/api';
import type { Environment } from '@/types/environment';

const ENV_BADGE_CFG: Record<string, string> = {
  PRODUCTION: 'border-red-500/30 bg-red-500/10 text-red-400',
  STAGING:    'border-blue-500/30 bg-blue-500/10 text-blue-400',
  TESTING:    'border-amber-500/30 bg-amber-500/10 text-amber-400',
  PREVIEW:    'border-purple-500/30 bg-purple-500/10 text-purple-400',
};

function getDomain(env: Environment): string | null {
  try { return env.env ? JSON.parse(env.env).domain ?? null : null; } catch { return null; }
}

function getEnvObj(env: Environment): Record<string, unknown> {
  try { return env.env ? JSON.parse(env.env) : {}; } catch { return {}; }
}

function DomainInlineEditor({ env, projectId, onSaved }: { env: Environment; projectId: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const domain = getDomain(env);
  const [value, setValue] = useState(domain ?? '');
  const [saving, setSaving] = useState(false);

  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true); setSaveError(null);
    try {
      const currentEnv = getEnvObj(env);
      await environmentsService.update(projectId, env.id, { env: JSON.stringify({ ...currentEnv, domain: value.trim() || undefined }) });
      setEditing(false);
      onSaved();
    } catch (err) { setSaveError(getApiErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ENV_BADGE_CFG[env.name] ?? 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400'}`}>
          {env.name}
        </span>
        {!editing && (
          <span className={`font-mono text-xs ${domain ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
            {domain || 'No domain'}
          </span>
        )}
      </div>
      {!editing ? (
        <button type="button" onClick={() => { setValue(domain ?? ''); setEditing(true); }}
          className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
          <Pencil size={10} /> {domain ? 'Edit' : 'Add domain'}
        </button>
      ) : (
        <div className="flex items-center gap-1.5">
          <input type="text" value={value} onChange={(e) => setValue(e.target.value)}
            placeholder="app.example.com" autoFocus
            className="w-48 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--text-primary)]/30" />
          <button type="button" onClick={() => void handleSave()} disabled={saving}
            className="flex items-center gap-1 rounded-lg bg-[var(--text-primary)] px-2.5 py-1.5 text-xs font-semibold text-[var(--bg-app)] disabled:opacity-50">
            {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
          </button>
          <button type="button" onClick={() => setEditing(false)}
            className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={10} />
          </button>
        </div>
      )}
      {saveError && (
        <p className="mt-1 text-xs text-red-400">{saveError}</p>
      )}
    </div>
  );
}

export function DomainsConfigSection({ projectId }: { projectId: string }) {
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    environmentsService.getAll(projectId)
      .then((result) => { if (mountedRef.current) setEnvs(result); })
      .catch((err) => { if (mountedRef.current) setError(getApiErrorMessage(err)); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [projectId]);

  useEffect(() => { mountedRef.current = true; load(); return () => { mountedRef.current = false; }; }, [load]);

  if (loading) return (
    <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-muted)]">
      <Loader2 size={13} className="animate-spin" /> Loading environments…
    </div>
  );

  if (error) return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-400">
      Failed to load environments: {error}
    </div>
  );

  if (envs.length === 0) return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-10 text-center">
      <Globe size={24} className="mb-2 text-[var(--text-muted)]" />
      <p className="text-sm font-semibold text-[var(--text-primary)]">No environments yet</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">Add an environment in the Environments section first.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--text-muted)]">Configure one domain per environment. Used for healthchecks and deployment URL.</p>
      <div className="space-y-2 pt-1">
        {envs.map((env) => (
          <DomainInlineEditor key={env.id} env={env} projectId={projectId} onSaved={load} />
        ))}
      </div>
    </div>
  );
}
