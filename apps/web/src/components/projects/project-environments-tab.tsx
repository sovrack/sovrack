'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Server,
  Trash2,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { environmentsService } from '@/services/environments.service';
import { getApiErrorMessage } from '@/lib/api';
import type { Environment, EnvName } from '@/types/environment';

const ENV_BADGE: Record<string, string> = {
  PRODUCTION: 'border-red-500/30 bg-red-500/10 text-red-400',
  STAGING:    'border-blue-500/30 bg-blue-500/10 text-blue-400',
  TESTING:    'border-amber-500/30 bg-amber-500/10 text-amber-400',
  PREVIEW:    'border-purple-500/30 bg-purple-500/10 text-purple-400',
};

const ENV_NAMES: EnvName[] = ['STAGING', 'PRODUCTION', 'TESTING', 'PREVIEW'];

const SERVICE_TYPE_STYLE: Record<string, string> = {
  APPLICATION: 'bg-blue-500/10 text-blue-300',
  DATABASE:    'bg-orange-500/10 text-orange-300',
  MANAGED:     'bg-purple-500/10 text-purple-300',
};

function AddEnvDialog({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [envName, setEnvName] = useState<EnvName>('STAGING');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      await environmentsService.create(projectId, { name: envName });
      onCreated();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Ajouter un environnement</h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Créez un environnement de déploiement.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]">
            <X size={13} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">{error}</div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Type d&apos;environnement</p>
            <div className="grid grid-cols-2 gap-2">
              {ENV_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setEnvName(name)}
                  className={clsx(
                    'rounded-xl border px-3 py-2.5 text-center text-xs font-bold uppercase tracking-wide transition',
                    envName === name
                      ? 'border-[var(--text-primary)] bg-[var(--hover)] text-[var(--text-primary)]'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]',
                  )}
                >
                  <span className={clsx('block rounded-full border px-2 py-0.5 text-[10px]', ENV_BADGE[name] ?? '')}>{name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--hover)] disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-40"
          >
            {saving ? <><Loader2 size={13} className="animate-spin" /> Création…</> : <><Plus size={13} /> Créer</>}
          </button>
        </div>
      </div>
    </div>
  );
}

type Props = { projectId: string; onChanged?: () => void; onDeploy?: (envId?: string) => void; compact?: boolean };

export function ProjectEnvironmentsTab({ projectId, onChanged, onDeploy, compact = false }: Props) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    environmentsService.getAll(projectId)
      .then(setEnvironments)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [projectId]);

  const handleDelete = async (envId: string) => {
    if (!confirm('Supprimer cet environnement ?')) return;
    setDeletingId(envId);
    try {
      await environmentsService.remove(projectId, envId);
      load();
      onChanged?.();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        <Loader2 size={14} className="animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">
          {environments.length} environnement{environments.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            <RefreshCw size={12} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90"
          >
            <Plus size={12} /> Ajouter
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {environments.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-12 text-center">
          <Server size={28} className="mb-3 text-[var(--text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">Aucun environnement</p>
          <p className="mt-1 max-w-xs text-xs text-[var(--text-secondary)]">
            Ajoutez un environnement STAGING ou PRODUCTION pour pouvoir déployer.
          </p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90"
          >
            <Plus size={14} /> Ajouter un environnement
          </button>
        </div>
      )}

      {environments.map((env) => {
        const envServices = env.serviceLinks ?? [];
        return (
          <div key={env.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={clsx('rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase', ENV_BADGE[env.name] ?? 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400')}>
                  {env.name}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {!compact && onDeploy && (
                  <button
                    type="button"
                    onClick={() => onDeploy(env.id)}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-2.5 py-1 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90"
                  >
                    <Rocket size={11} /> Deploy
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleDelete(env.id)}
                  disabled={deletingId === env.id}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                  title="Supprimer"
                >
                  {deletingId === env.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </button>
              </div>
            </div>

            {envServices.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
                {envServices.map((link) => (
                  <div key={link.id} className="flex items-center gap-1.5 rounded-lg border border-green-500/20 bg-green-500/8 px-2.5 py-1 text-xs">
                    <CheckCircle2 size={10} className="text-green-400" />
                    <span className="font-semibold text-[var(--text-primary)]">{link.service?.name ?? '?'}</span>
                    {link.service?.type && (
                      <span className={clsx('rounded px-1 py-0.5 text-[9px] font-semibold uppercase', SERVICE_TYPE_STYLE[link.service.type] ?? '')}>
                        {link.service.type}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {envServices.length === 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <Globe size={12} />
                Aucun service dans cet environnement.
              </div>
            )}
          </div>
        );
      })}

      {addOpen && (
        <AddEnvDialog
          projectId={projectId}
          onClose={() => setAddOpen(false)}
          onCreated={() => { setAddOpen(false); load(); onChanged?.(); }}
        />
      )}
    </div>
    </div>
  );
}
