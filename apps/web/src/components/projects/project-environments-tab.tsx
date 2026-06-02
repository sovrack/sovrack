'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Globe,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { environmentsService } from '@/services/environments.service';
import { serversService } from '@/services/servers.service';
import { getApiErrorMessage } from '@/lib/api';
import type { Environment, EnvName } from '@/types/environment';
import type { Server as ServerType } from '@/types/server';
import { EnvConfigsPanel } from './env-configs-panel';

const ENV_BADGE: Record<string, string> = {
  PRODUCTION: 'border-red-500/30 bg-red-500/10 text-red-400',
  STAGING:    'border-blue-500/30 bg-blue-500/10 text-blue-400',
  TESTING:    'border-amber-500/30 bg-amber-500/10 text-amber-400',
  PREVIEW:    'border-purple-500/30 bg-purple-500/10 text-purple-400',
};

const ENV_NAMES: EnvName[] = ['STAGING', 'PRODUCTION', 'TESTING', 'PREVIEW'];

/* ─── Add environment dialog ─────────────────────────────────────────────── */

function AddEnvDialog({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [servers, setServers] = useState<ServerType[]>([]);
  const [loadingServers, setLoadingServers] = useState(true);
  const [envName, setEnvName] = useState<EnvName>('STAGING');
  const [serverId, setServerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    serversService.getAll().then((list) => {
      const verified = list.filter((s) => s.isVerified && s.isActive);
      setServers(verified);
      if (verified.length > 0) setServerId(verified[0].id);
    }).catch(() => {}).finally(() => setLoadingServers(false));
  }, []);

  const handleCreate = async () => {
    if (!serverId) { setError('Sélectionnez un serveur'); return; }
    setSaving(true);
    setError(null);
    try {
      await environmentsService.create(projectId, { name: envName, serverId });
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
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Ajouter un environnement</h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Associez un VPS vérifié à cet environnement.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]">
            <X size={13} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">{error}</div>
          )}

          {/* Env type */}
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

          {/* Server selection */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">VPS cible <span className="text-red-400">*</span></p>
            {loadingServers ? (
              <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-muted)]">
                <Loader2 size={13} className="animate-spin" /> Chargement des serveurs…
              </div>
            ) : servers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-5 text-center text-sm text-[var(--text-secondary)]">
                <Server size={20} className="mx-auto mb-2 text-[var(--text-muted)]" />
                <p>Aucun VPS vérifié disponible.</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Allez dans <strong>Remote Servers</strong> pour préparer un serveur.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {servers.map((srv) => (
                  <button
                    key={srv.id}
                    type="button"
                    onClick={() => setServerId(srv.id)}
                    className={clsx(
                      'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition',
                      serverId === srv.id
                        ? 'border-[var(--text-primary)] bg-[var(--hover)]'
                        : 'border-[var(--border)] hover:bg-[var(--hover)]',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{srv.name}</p>
                      <p className="font-mono text-xs text-[var(--text-muted)]">{srv.host}:{srv.port}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {srv.hasDocker && <span className="text-[10px] font-semibold text-green-400">Docker ✓</span>}
                      {serverId === srv.id && <CheckCircle2 size={14} className="text-green-400" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
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
            disabled={saving || !serverId}
            className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-40"
          >
            {saving ? <><Loader2 size={13} className="animate-spin" /> Création…</> : <><Plus size={13} /> Créer</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main tab ───────────────────────────────────────────────────────────── */

type Props = { projectId: string; onChanged?: () => void };

export function ProjectEnvironmentsTab({ projectId, onChanged }: Props) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [configsOpenId, setConfigsOpenId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    environmentsService
      .getAll(projectId)
      .then(setEnvironments)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">
          {environments.length} environnement{environments.length !== 1 ? 's' : ''} configuré{environments.length !== 1 ? 's' : ''}
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
            Ajoutez un environnement STAGING ou PRODUCTION et associez-lui un VPS vérifié pour pouvoir déployer.
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

      {environments.map((env) => (
        <div key={env.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={clsx('rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase', ENV_BADGE[env.name] ?? 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400')}>
                {env.name}
              </span>
              <div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
                  <Server size={13} className="text-[var(--text-muted)]" />
                  {env.server?.name ?? env.serverId}
                </div>
                <p className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">{env.server?.host}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {env.isActive && (
                <span className="flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                  <CheckCircle2 size={9} /> Active
                </span>
              )}
              {env.autoDeploy && (
                <span className="flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
                  <Zap size={9} /> Auto
                </span>
              )}
              {env.domain && (
                <span className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--hover)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
                  <Globe size={9} /> {env.domain}
                </span>
              )}
              <button
                type="button"
                onClick={() => setConfigsOpenId(configsOpenId === env.id ? null : env.id)}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition',
                  configsOpenId === env.id
                    ? 'border-[var(--text-primary)]/30 bg-[var(--hover)] text-[var(--text-primary)]'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                )}
                title="Variables d'environnement"
              >
                <KeyRound size={11} /> Variables
              </button>
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

          {env.serviceTargets && env.serviceTargets.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
              {env.serviceTargets.map((target) => (
                <div key={target.id} className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--hover)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-primary)]">{target.service?.name ?? target.serviceId}</span>
                  {target.domain && <span className="font-mono opacity-70">{target.domain}</span>}
                  {target.port && <span className="opacity-70">:{target.port}</span>}
                </div>
              ))}
            </div>
          )}

          {configsOpenId === env.id && (
            <EnvConfigsPanel
              projectId={projectId}
              environmentId={env.id}
              onClose={() => setConfigsOpenId(null)}
            />
          )}
        </div>
      ))}

      {addOpen && (
        <AddEnvDialog
          projectId={projectId}
          onClose={() => setAddOpen(false)}
          onCreated={() => { setAddOpen(false); load(); onChanged?.(); }}
        />
      )}
    </div>
  );
}
