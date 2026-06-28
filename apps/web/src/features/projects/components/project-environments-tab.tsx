'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
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
import { environmentsService } from '@/features/projects/api/environments.service';
import { useProjectEnvironments } from '@/features/projects/api/use-project-environments';
import { getApiErrorMessage } from '@/shared/lib/api';
import { DatabaseBackupsPanel } from '@/features/databases';
import { useConfirm } from '@/shared/contexts/confirm-context';
import { useServers } from '@/features/servers';
import type { EnvName } from '@/features/projects/types/environment';

const ENV_BADGE: Record<string, string> = {
  PRODUCTION: 'border-red-500/30 bg-red-500/10 text-red-400',
  STAGING:    'border-blue-500/30 bg-blue-500/10 text-blue-400',
  TESTING:    'border-amber-500/30 bg-amber-500/10 text-amber-400',
  PREVIEW:    'border-indigo-500/30 bg-indigo-500/10 text-indigo-400',
};

const ENV_NAMES: EnvName[] = ['STAGING', 'PRODUCTION', 'TESTING', 'PREVIEW'];

const SERVICE_TYPE_STYLE: Record<string, string> = {
  APPLICATION: 'bg-blue-500/10 text-blue-300',
  DATABASE:    'bg-orange-500/10 text-orange-300',
  MANAGED:     'bg-indigo-500/10 text-indigo-300',
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
  const [serverIds, setServerIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serversQuery = useServers();
  const servers = serversQuery.data ?? [];

  const toggleServer = (id: string) =>
    setServerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      // An environment targets one or more VPS — create it, then attach the
      // selected server(s). See ANALYSE_ET_PLAN_COMPLET §1 (environment = VPS selection).
      const env = await environmentsService.create(projectId, { name: envName });
      for (const serverId of serverIds) {
        await environmentsService.assignServer(projectId, env.id, serverId);
      }
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
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Add an environment</h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Create a deployment environment.</p>
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

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Target VPS</p>
            {servers.length === 0 ? (
              <p className="rounded-xl border border-[var(--border)] bg-[var(--hover)] px-3 py-2 text-xs text-[var(--text-muted)]">
                No servers yet — add one in Remote Servers, then attach it here.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {servers.map((s) => {
                  const selected = serverIds.includes(s.id);
                  return (
                    <button key={s.id} type="button" onClick={() => toggleServer(s.id)}
                      className={clsx(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition',
                        selected
                          ? 'border-[var(--text-primary)]/30 bg-[var(--text-primary)]/10 text-[var(--text-primary)]'
                          : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]',
                      )}>
                      {selected ? <CheckCircle2 size={13} /> : <Server size={13} />}
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{s.status}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--hover)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-40"
          >
            {saving ? <><Loader2 size={13} className="animate-spin" /> Creating…</> : <><Plus size={13} /> Create</>}
          </button>
        </div>
      </div>
    </div>
  );
}

type Props = { projectId: string; onChanged?: () => void; onDeploy?: (envId?: string) => void; compact?: boolean };

export function ProjectEnvironmentsTab({ projectId, onChanged, onDeploy, compact = false }: Props) {
  const envsQuery = useProjectEnvironments(projectId);
  const queryClient = useQueryClient();
  const environments = envsQuery.data ?? [];
  const loading = envsQuery.isLoading;
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const error = actionError ?? (envsQuery.error ? getApiErrorMessage(envsQuery.error) : null);
  const confirm = useConfirm();

  const load = () =>
    queryClient.invalidateQueries({ queryKey: ['project', projectId, 'environments'] });

  const handleDelete = async (envId: string) => {
    if (!(await confirm({ title: 'Delete this environment?', confirmLabel: 'Delete', variant: 'danger' }))) return;
    setDeletingId(envId);
    setActionError(null);
    try {
      await environmentsService.remove(projectId, envId);
      await load();
      onChanged?.();
    } catch (err) {
      setActionError(getApiErrorMessage(err));
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
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            <RefreshCw size={12} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90"
          >
            <Plus size={12} /> Add
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {environments.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-12 text-center">
          <Server size={28} className="mb-3 text-[var(--text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">No environment</p>
          <p className="mt-1 max-w-xs text-xs text-[var(--text-secondary)]">
            Add a STAGING or PRODUCTION environment to be able to deploy.
          </p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90"
          >
            <Plus size={14} /> Add an environment
          </button>
        </div>
      )}

      {environments.map((env) => {
        const envServices = env.serviceLinks ?? [];
        return (
          <div key={env.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={clsx('rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase', ENV_BADGE[env.name] ?? 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400')}>
                  {env.name}
                </span>
                {/* Serveur lié — sinon avertissement (les déploiements échoueraient). */}
                {(env.servers?.length ?? 0) > 0 ? (
                  <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                    <Server size={11} /> {env.servers!.map((s) => s.name).join(', ')}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400"
                    title="Liez un serveur (actif et vérifié) pour pouvoir déployer.">
                    <AlertTriangle size={11} /> Aucun serveur lié
                  </span>
                )}
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
                  title="Delete"
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

            {envServices
              .filter((link) => link.service?.type === 'DATABASE')
              .map((link) => (
                <DatabaseBackupsPanel
                  key={`backup-${link.id}`}
                  serviceEnvId={link.id}
                  serviceName={link.service?.name}
                />
              ))}

            {envServices.length === 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <Globe size={12} />
                No services in this environment.
              </div>
            )}
          </div>
        );
      })}

      {addOpen && (
        <AddEnvDialog
          projectId={projectId}
          onClose={() => setAddOpen(false)}
          onCreated={() => { setAddOpen(false); void load(); onChanged?.(); }}
        />
      )}
    </div>
    </div>
  );
}
