'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Key, Plus, Trash2, Loader2, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { configsService } from '@/services/configs.service';
import { useAuth } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/api';
import clsx from 'clsx';
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
      <div>
        <Link href={`/projects/${projectId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700">
          <ArrowLeft size={15} /> Back to Project
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Environment Variables</h1>
            <p className="mt-1 text-sm text-slate-500">
              {isAdmin
                ? 'Key/value pairs injected into the container at deployment. Secrets are encrypted.'
                : 'Read-only view. Variable management is restricted to admins.'}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void fetchConfigs()} disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            {isAdmin && (
              <button onClick={() => setShowForm((v) => !v)}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-indigo-700">
                <Plus size={16} /> Add Variable
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {!isAdmin && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          Only admins can create, update or delete variables.
        </div>
      )}

      {/* Create form */}
      {showForm && isAdmin && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">New Variable</h2>
          {formError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Key <span className="text-red-400">*</span></label>
              <input type="text" value={key} onChange={(e) => setKey(e.target.value)}
                placeholder="DATABASE_URL" required
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Value <span className="text-red-400">*</span></label>
              <input type={isSecret ? 'password' : 'text'} value={value} onChange={(e) => setValue(e.target.value)}
                placeholder="postgresql://..." required
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-3">
            <div className={clsx('relative h-5 w-9 rounded-full transition', isSecret ? 'bg-indigo-500' : 'bg-slate-200')}>
              <div className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', isSecret ? 'left-4' : 'left-0.5')} />
            </div>
            <input type="checkbox" checked={isSecret} onChange={(e) => setIsSecret(e.target.checked)} className="sr-only" />
            <span className="text-sm text-slate-700">Mark as secret (encrypted at rest)</span>
          </label>

          <div className="flex gap-3">
            <button type="button" onClick={() => setShowForm(false)}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !key.trim() || !value.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60">
              {submitting && <Loader2 size={15} className="animate-spin" />}
              Save
            </button>
          </div>
        </form>
      )}

      {/* Variables table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : configs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center">
          <Key size={28} className="text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-500">No variables yet</p>
          <p className="mt-1 text-xs text-slate-400">Add env vars that will be injected into your containers.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Key</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Value</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {configs.map((cfg) => {
                const isRevealed = revealedIds.has(cfg.id);
                return (
                  <tr key={cfg.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-3.5 font-mono text-sm font-semibold text-slate-900">{cfg.key}</td>
                    <td className="px-5 py-3.5 font-mono text-sm text-slate-600 max-w-xs truncate">
                      {cfg.isSecret && !isRevealed ? '••••••••••••' : cfg.value}
                    </td>
                    <td className="px-5 py-3.5">
                      {cfg.isSecret ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">🔒 Secret</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Plain</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && cfg.isSecret && (
                          <button onClick={() => toggleReveal(cfg.id)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                            {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => void handleDelete(cfg.id, cfg.key)} disabled={deletingId === cfg.id}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50">
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
        </div>
      )}
    </div>
  );
}
