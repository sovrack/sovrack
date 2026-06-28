'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Layers, Loader2, Plus, Save, X } from 'lucide-react';
import { environmentsService } from '@/features/projects/api/environments.service';
import { getApiErrorMessage } from '@/shared/lib/api';
import { SectionCard } from '@/shared/layout/section-card';

/**
 * Onglet Variables/Environments d'un service : lier/délier le service à chaque
 * environnement (1 lien = 1 instance déployable) + éditer ses variables/secrets.
 * Extrait du god-page services/[serviceId]/page.tsx (P2).
 */
export function ServiceEnvironments({
  projectId,
  serviceId,
  environments,
  envLinks,
  onChanged,
}: {
  projectId: string;
  serviceId: string;
  environments: { id: string; name: string }[];
  envLinks: { id: string; environmentId: string }[];
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null); // serviceEnvId déplié

  const linkFor = (envId: string) =>
    envLinks.find((l) => l.environmentId === envId) ?? null;

  const toggle = async (envId: string) => {
    setBusyId(envId);
    setError(null);
    try {
      const link = linkFor(envId);
      if (link) {
        await environmentsService.unlinkService(projectId, link.id);
      } else {
        await environmentsService.linkService(projectId, envId, serviceId);
      }
      onChanged();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SectionCard
      title="Environments & variables"
      description="This service runs in every linked environment (1 link = 1 deployable instance). Each instance has ITS OWN variables."
    >
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      {environments.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No environment — create one in the project&apos;s{' '}
          <Link
            href={`/projects/${projectId}?tab=environments`}
            className="underline hover:text-[var(--text-primary)]"
          >
            Environments
          </Link>{' '}
          tab.
        </p>
      ) : (
        <div className="space-y-2">
          {environments.map((env) => {
            const link = linkFor(env.id);
            const linked = !!link;
            const busy = busyId === env.id;
            const isOpen = !!link && openId === link.id;
            return (
              <div
                key={env.id}
                className="overflow-hidden rounded-lg border border-[var(--border)]"
              >
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="flex items-center gap-2 text-sm">
                    <Layers size={14} className="text-[var(--text-muted)]" />
                    <span className="font-medium text-[var(--text-primary)]">
                      {env.name}
                    </span>
                    {linked && (
                      <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                        Linked
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {linked && link && (
                      <button
                        type="button"
                        onClick={() => setOpenId(isOpen ? null : link.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                      >
                        <ChevronDown
                          size={12}
                          className={isOpen ? 'rotate-180 transition' : 'transition'}
                        />{' '}
                        Variables
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void toggle(env.id)}
                      disabled={busy}
                      className={
                        linked
                          ? 'inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50'
                          : 'inline-flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-50'
                      }
                    >
                      {busy ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : linked ? (
                        <X size={12} />
                      ) : (
                        <Plus size={12} />
                      )}
                      {linked ? 'Detach' : 'Add to this environment'}
                    </button>
                  </div>
                </div>
                {isOpen && link && (
                  <EnvVarsEditor projectId={projectId} serviceEnvId={link.id} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

/** Éditeur des variables d'UNE instance (ServiceEnvironment = service × env). */
type KV = { key: string; value: string };
function kvFromRaw(raw: unknown): KV[] {
  let obj: Record<string, unknown> = {};
  if (typeof raw === 'string' && raw.trim()) {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  } else if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  }
  return Object.entries(obj).map(([key, value]) => ({
    key,
    value: String(value ?? ''),
  }));
}
function kvToJson(rows: KV[]): string {
  const o: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (k) o[k] = r.value;
  }
  return JSON.stringify(o);
}

/** Lignes KEY=value (ajouter/supprimer). `secret` masque les valeurs. */
function KvRows({
  rows,
  setRows,
  secret,
}: {
  rows: KV[];
  setRows: (r: KV[]) => void;
  secret?: boolean;
}) {
  const inputCls =
    'rounded-md border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]';
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={r.key}
            onChange={(e) =>
              setRows(rows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
            }
            placeholder="KEY"
            className={`${inputCls} w-1/3`}
          />
          <span className="text-[var(--text-muted)]">=</span>
          <input
            value={r.value}
            type={secret ? 'password' : 'text'}
            onChange={(e) =>
              setRows(
                rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
              )
            }
            placeholder="value"
            className={`${inputCls} flex-1`}
          />
          <button
            type="button"
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:text-red-400"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows([...rows, { key: '', value: '' }])}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
      >
        <Plus size={11} /> Add a variable
      </button>
    </div>
  );
}

function EnvVarsEditor({
  projectId,
  serviceEnvId,
}: {
  projectId: string;
  serviceEnvId: string;
}) {
  const [vars, setVars] = useState<KV[]>([]);
  const [secrets, setSecrets] = useState<KV[]>([]);
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [autoBranch, setAutoBranch] = useState('main');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    environmentsService
      .getServiceLink(projectId, serviceEnvId)
      .then((se) => {
        if (!alive) return;
        setVars(kvFromRaw(se.env as unknown));
        setAutoDeploy(!!se.autoDeploy);
        setAutoBranch(se.autoBranch ?? 'main');
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId, serviceEnvId]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload: {
        env?: string;
        secretsEnv?: string;
        autoDeploy?: boolean;
        autoBranch?: string;
      } = {
        autoDeploy,
        autoBranch: autoBranch.trim() || 'main',
        env: kvToJson(vars),
      };
      const secretRows = secrets.filter((s) => s.key.trim());
      if (secretRows.length) payload.secretsEnv = kvToJson(secretRows);
      await environmentsService.updateServiceLink(projectId, serviceEnvId, payload);
      setMsg('Saved ✓');
      setSecrets([]);
    } catch (e) {
      setMsg(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const lbl =
    'mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]';

  return (
    <div className="space-y-3 border-t border-[var(--border)] bg-[var(--bg-app)]/40 px-3 py-3">
      {loading ? (
        <p className="text-xs text-[var(--text-muted)]">Loading…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
            <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={autoDeploy}
                onChange={(e) => setAutoDeploy(e.target.checked)}
              />
              Auto-deploy on push
            </label>
            <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              branch
              <input
                value={autoBranch}
                onChange={(e) => setAutoBranch(e.target.value)}
                placeholder="main"
                disabled={!autoDeploy}
                className="w-32 rounded-md border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none disabled:opacity-50"
              />
            </span>
          </div>
          <div>
            <label className={lbl}>Variables</label>
            <KvRows rows={vars} setRows={setVars} />
          </div>
          <div>
            <label className={lbl}>
              Secrets (encrypted at rest · write-only)
            </label>
            <KvRows rows={secrets} setRows={setSecrets} secret />
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              Leave empty to keep the existing secrets.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Save size={12} />
              )}{' '}
              Save
            </button>
            {msg && <span className="text-xs text-[var(--text-secondary)]">{msg}</span>}
          </div>
        </>
      )}
    </div>
  );
}
