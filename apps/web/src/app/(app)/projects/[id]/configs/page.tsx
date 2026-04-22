'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { Key, Plus, Trash2, Loader2, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { configsService } from '@/services/configs.service';
import { useAuth } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/api';
import clsx from 'clsx';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import type { Config, CreateConfigPayload } from '@/types/config';

type Props = { params: Promise<{ id: string }> };

export default function ConfigsPage({ params }: Props) {
  const { id: projectId } = use(params);
  const { isAdmin } = useAuth();
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [isSecret, setIsSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setConfigs(await configsService.getAll(projectId));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void fetchConfigs(); }, [fetchConfigs]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) { setFormError('Action reservee aux administrateurs.'); return; }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload: CreateConfigPayload = { key: key.trim(), value: value.trim(), isSecret };
      const created = await configsService.create(projectId, payload);
      setConfigs((prev) => [...prev, created]);
      setKey(''); setValue(''); setIsSecret(false);
      setShowForm(false);
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (configId: string, configKey: string) => {
    if (!isAdmin) return;
    if (!confirm(`Delete variable "${configKey}"?`)) return;
    setDeletingId(configId);
    try {
      await configsService.remove(projectId, configId);
      setConfigs((prev) => prev.filter((c) => c.id !== configId));
    } catch (err) {
      alert(getApiErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project"
        title="Environment Variables"
        description={
          isAdmin
            ? 'Key/value pairs injected into the container at deployment. Secrets are encrypted.'
            : 'Read-only view. Variable management is restricted to admins.'
        }
        actions={
          <>
            <button
              onClick={() => void fetchConfigs()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-3 py-2 text-sm font-medium text-[var(--text-primary)] shadow-sm transition hover:bg-[var(--bg-card)]/10 disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowForm((v) => !v)}
                className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] shadow transition hover:opacity-90"
              >
                <Plus size={16} /> Add Variable
              </button>
            )}
          </>
        }
      />

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {!isAdmin && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--text-primary)]/10 px-4 py-3 text-sm text-[var(--text-secondary)]">
          Only admins can create, update or delete variables.
        </div>
      )}

      {showForm && isAdmin && (
        <SectionCard title="New Variable" description="Create a new environment variable for this project.">
          <form onSubmit={handleCreate} className="space-y-4">
          {formError && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{formError}</div>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">Key <span className="text-red-400">*</span></label>
              <input type="text" value={key} onChange={(e) => setKey(e.target.value)}
                placeholder="DATABASE_URL" required
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-3 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">Value <span className="text-red-400">*</span></label>
              <input type={isSecret ? 'password' : 'text'} value={value} onChange={(e) => setValue(e.target.value)}
                placeholder="postgresql://..." required
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-3 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20" />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-3">
            <div className={clsx('relative h-5 w-9 rounded-full transition', isSecret ? 'bg-[var(--text-primary)]' : 'bg-[var(--bg-card)]/15')}>
              <div className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-[var(--bg-card)] shadow transition-all', isSecret ? 'left-4' : 'left-0.5')} />
            </div>
            <input type="checkbox" checked={isSecret} onChange={(e) => setIsSecret(e.target.checked)} className="sr-only" />
            <span className="text-sm text-[var(--text-primary)]">Mark as secret (encrypted at rest)</span>
          </label>

          <div className="flex gap-3">
            <button type="button" onClick={() => setShowForm(false)}
              className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-card)]/10">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !key.trim() || !value.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-60">
              {submitting && <Loader2 size={15} className="animate-spin" />}
              Save
            </button>
          </div>
          </form>
        </SectionCard>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--bg-card)]/10" />)}
        </div>
      ) : configs.length === 0 ? (
        <SectionCard>
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-card)]/5 py-14 text-center">
            <Key size={28} className="text-[var(--text-primary)]" />
            <p className="mt-3 text-sm font-medium text-[var(--text-secondary)]">No variables yet</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Add env vars that will be injected into your containers.</p>
          </div>
        </SectionCard>
      ) : (
        <SectionCard contentClassName="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-card)]/5">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Key</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Value</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Type</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {configs.map((cfg) => {
                const isRevealed = revealedIds.has(cfg.id);
                const isMaskedSecret = cfg.isSecret && cfg.value === '***';
                return (
                  <tr key={cfg.id} className="hover:bg-[var(--bg-card)]/5 transition">
                    <td className="px-5 py-3.5 font-mono text-sm font-semibold text-[var(--text-primary)]">{cfg.key}</td>
                    <td className="px-5 py-3.5 font-mono text-sm text-[var(--text-secondary)] max-w-xs truncate">
                      {isMaskedSecret ? (
                        <div className="space-y-1">
                          <div>***</div>
                          <p className="font-sans text-xs text-[var(--text-secondary)]">
                            Secret chiffré — modifiez pour changer.
                          </p>
                        </div>
                      ) : cfg.isSecret && !isRevealed ? (
                        '••••••••••••'
                      ) : (
                        cfg.value
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {cfg.isSecret ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--text-primary)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">🔒 Secret</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-card)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">Plain</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && cfg.isSecret && !isMaskedSecret && (
                          <button onClick={() => toggleReveal(cfg.id)}
                            className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--bg-card)]/10 hover:text-[var(--text-primary)]">
                            {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => void handleDelete(cfg.id, cfg.key)} disabled={deletingId === cfg.id}
                            className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50">
                            {deletingId === cfg.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SectionCard>
      )}
    </div>
  );
}
