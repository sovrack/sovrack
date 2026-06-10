'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Globe, Loader2, Pencil, Save, X, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { environmentsService } from '@/services/environments.service';
import { getApiErrorMessage } from '@/lib/api';
import type { Environment } from '@/types/environment';

const ENV_BADGE: Record<string, string> = {
  PRODUCTION: 'border-red-500/30 bg-red-500/10 text-red-400',
  STAGING:    'border-blue-500/30 bg-blue-500/10 text-blue-400',
  TESTING:    'border-amber-500/30 bg-amber-500/10 text-amber-400',
  PREVIEW:    'border-purple-500/30 bg-purple-500/10 text-purple-400',
};

type DomainRowProps = {
  label: string;
  badge: string;
  domain: string | null;
  envId: string;
  projectId: string;
  onSaved: () => void;
};

function DomainRow({ label, badge, domain, envId, projectId, onSaved }: DomainRowProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(domain ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      await environmentsService.update(projectId, envId, { domain: value || undefined });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setValue(domain ?? '');
    setEditing(false);
    setError(null);
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${badge}`}>
            {label}
          </span>
          {domain
            ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 size={11} /> Domain configured</span>
            : <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]"><XCircle size={11} /> No domain</span>}
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
            <Pencil size={11} /> Edit
          </button>
        )}
      </div>

      {!editing ? (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-3">
          <Globe size={14} className={domain ? 'text-green-400' : 'text-[var(--text-muted)]'} />
          {domain
            ? <a href={`https://${domain}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 font-mono text-sm text-[var(--text-primary)] hover:underline">
                {domain} <ExternalLink size={11} />
              </a>
            : <span className="font-mono text-sm text-[var(--text-muted)]">—</span>}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="api.myapp.com"
              autoFocus
              className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)]/40"
            />
            <button type="button" onClick={() => void handleSave()} disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--text-primary)] px-3 py-2 text-xs font-semibold text-[var(--bg-app)] disabled:opacity-50">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
            </button>
            <button type="button" onClick={handleCancel}
              className="rounded-xl border border-[var(--border)] p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X size={14} />
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <p className="text-[10px] text-[var(--text-muted)]">
            Enter the domain without protocol (e.g. <code className="font-mono">api.myapp.com</code>). SSL is configured at the server/nginx level.
          </p>
        </div>
      )}

      {/* Service targets domains */}
      {/* Future: show per-service domain targets here */}
    </div>
  );
}

type Props = {
  projectId: string;
};

export function DomainsTab({ projectId }: Props) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    environmentsService.getAll(projectId)
      .then(setEnvironments)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [projectId]);

  if (loading) return (
    <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-sm text-[var(--text-secondary)]">
      <Loader2 size={14} className="animate-spin" /> Loading environments…
    </div>
  );

  if (error) return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300">{error}</div>
  );

  if (environments.length === 0) return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-16 text-center">
      <Globe size={28} className="mb-3 text-[var(--text-muted)]" />
      <p className="text-sm font-semibold text-[var(--text-primary)]">No environments yet</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        Add an environment in the Environments tab to configure domain routing.
      </p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Domain routing</p>
          <p className="text-xs text-[var(--text-muted)]">Assign a domain to each environment. Nginx is configured automatically on deploy.</p>
        </div>
      </div>

      {environments.map((env) => (
        <DomainRow
          key={env.id}
          label={env.name}
          badge={ENV_BADGE[env.name] ?? 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400'}
          domain={env.domain}
          envId={env.id}
          projectId={projectId}
          onSaved={load}
        />
      ))}

      <div className={clsx(
        'rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3',
      )}>
        <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Globe size={12} className="shrink-0" />
          Per-service domain overrides are configured in the Environments tab under each service target.
          SSL/TLS is handled automatically by Nginx during deployment.
        </p>
      </div>
    </div>
  );
}
