'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, Lock, Plus, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import { envConfigsService } from '@/services/env-configs.service';
import { getApiErrorMessage } from '@/lib/api';
import type { EnvConfig } from '@/types/config';

/* ─── Add / Edit form ───────────────────────────────────────────────────────── */

function AddEnvConfigForm({
  projectId,
  environmentId,
  onSaved,
}: {
  projectId: string;
  environmentId: string;
  onSaved: () => void;
}) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [isSecret, setIsSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!key.trim() || !value.trim()) {
      setError('La clé et la valeur sont obligatoires');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await envConfigsService.upsert(projectId, environmentId, {
        key: key.trim(),
        value,
        isSecret,
      });
      setKey('');
      setValue('');
      setIsSecret(false);
      onSaved();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--hover)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Nouvelle variable</p>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Clé</label>
          <input
            type="text"
            placeholder="DATABASE_URL"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--text-primary)]/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Valeur</label>
          <input
            type={isSecret ? 'password' : 'text'}
            placeholder="valeur…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--text-primary)]/30"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={isSecret}
            onChange={(e) => setIsSecret(e.target.checked)}
            className="h-3.5 w-3.5 rounded accent-[var(--text-primary)]"
          />
          <Lock size={11} />
          Secret (valeur masquée)
        </label>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !key.trim() || !value.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-40"
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}

/* ─── Config row ─────────────────────────────────────────────────────────── */

function EnvConfigRow({
  config,
  onDelete,
}: {
  config: EnvConfig;
  onDelete: () => void;
}) {
  const [showValue, setShowValue] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Supprimer la variable "${config.key}" ?`)) return;
    setDeleting(true);
    try {
      onDelete();
    } finally {
      setDeleting(false);
    }
  };

  const displayValue = config.isSecret
    ? showValue
      ? config.value
      : '••••••••'
    : config.value;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
      {config.isSecret && <Lock size={11} className="shrink-0 text-amber-400" />}
      <span className="min-w-0 flex-1 font-mono text-xs font-semibold text-[var(--text-primary)]">{config.key}</span>
      <span className={clsx('min-w-0 max-w-[200px] truncate font-mono text-xs', config.isSecret ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]')}>
        {displayValue}
      </span>

      {config.isSecret && (
        <button
          type="button"
          onClick={() => setShowValue((v) => !v)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition hover:text-[var(--text-secondary)]"
          title={showValue ? 'Masquer' : 'Afficher'}
        >
          {showValue ? <EyeOff size={11} /> : <Eye size={11} />}
        </button>
      )}

      <button
        type="button"
        onClick={() => void handleDelete()}
        disabled={deleting}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
        title="Supprimer"
      >
        {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
      </button>
    </div>
  );
}

/* ─── Main panel ─────────────────────────────────────────────────────────── */

type Props = {
  projectId: string;
  environmentId: string;
  onClose: () => void;
};

export function EnvConfigsPanel({ projectId, environmentId, onClose }: Props) {
  const [configs, setConfigs] = useState<EnvConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    envConfigsService
      .getAll(projectId, environmentId)
      .then(setConfigs)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [projectId, environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (key: string) => {
    try {
      await envConfigsService.remove(projectId, environmentId, key);
      load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound size={13} className="text-[var(--text-muted)]" />
          <span className="text-xs font-semibold text-[var(--text-primary)]">Variables d&apos;environnement</span>
          <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
            {configs.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        >
          <X size={11} />
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-[var(--text-muted)]">
          <Loader2 size={12} className="animate-spin" /> Chargement…
        </div>
      ) : (
        <div className="space-y-1.5">
          {configs.length === 0 && (
            <p className="py-1 text-xs text-[var(--text-muted)]">
              Aucune variable spécifique à cet environnement. Les variables globales du projet s&apos;appliquent.
            </p>
          )}
          {configs.map((c) => (
            <EnvConfigRow
              key={c.id}
              config={c}
              onDelete={() => void handleDelete(c.key)}
            />
          ))}
        </div>
      )}

      <AddEnvConfigForm
        projectId={projectId}
        environmentId={environmentId}
        onSaved={load}
      />
    </div>
  );
}
