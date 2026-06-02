'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Key, Loader2, Lock, Plus, RefreshCw, Trash2, Unlock } from 'lucide-react';
import { configsService } from '@/services/configs.service';
import { useAuth } from '@/hooks/auth/use-auth';
import { getApiErrorMessage } from '@/lib/api';
import type { Config, CreateConfigPayload } from '@/types/config';

type ProjectConfigsTabProps = { projectId: string };

function SecretValue({ value }: { value: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="flex items-center gap-1.5 font-mono text-xs">
      <span className="text-[var(--text-primary)]">{show ? value : '••••••••'}</span>
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      >
        {show ? <EyeOff size={11} /> : <Eye size={11} />}
      </button>
    </span>
  );
}

export function ProjectConfigsTab({ projectId }: ProjectConfigsTabProps) {
  const { isAdmin } = useAuth();
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    if (!key.trim() || !value.trim()) { setFormError('Key and value are required.'); return; }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload: CreateConfigPayload = { key: key.trim(), value: value.trim(), isSecret };
      const created = await configsService.create(projectId, payload);
      setConfigs((prev) => [...prev, created]);
      setKey(''); setValue(''); setIsSecret(false); setShowForm(false);
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[var(--text-muted)]">
            {configs.length} variable{configs.length !== 1 ? 's' : ''} — injectées dans les conteneurs au déploiement
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchConfigs()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover)]"
            >
              <Plus size={11} /> Add Variable
            </button>
          )}
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3"
        >
          <p className="text-xs font-semibold text-[var(--text-primary)]">New variable</p>
          {formError && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{formError}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Key</label>
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="DATABASE_URL"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-blue-500/40"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Value</label>
              <input
                type={isSecret ? 'password' : 'text'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="value"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-blue-500/40"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsSecret((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                isSecret
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {isSecret ? <Lock size={11} /> : <Unlock size={11} />}
              {isSecret ? 'Secret (encrypted)' : 'Plain text'}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); setFormError(null); setKey(''); setValue(''); }}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-4 py-1.5 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Save
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" />
        </div>
      )}

      {/* Empty state */}
      {!loading && configs.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-12 text-center">
          <Key size={24} className="mb-3 text-[var(--text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">No variables yet</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Add env vars that will be injected into your containers.
          </p>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mt-4 flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <Plus size={12} /> Add first variable
            </button>
          )}
        </div>
      )}

      {/* Variables list */}
      {!loading && configs.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] divide-y divide-[var(--border)]">
          {configs.map((config) => (
            <div key={config.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">{config.key}</span>
                  {config.isSecret && (
                    <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/20 bg-amber-500/10 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-400">
                      <Lock size={8} /> Secret
                    </span>
                  )}
                </div>
                <div className="mt-0.5">
                  {config.isSecret ? (
                    <SecretValue value={config.value} />
                  ) : (
                    <span className="font-mono text-xs text-[var(--text-secondary)]">{config.value}</span>
                  )}
                </div>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => void handleDelete(config.id, config.key)}
                  disabled={deletingId === config.id}
                  className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                >
                  {deletingId === config.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
