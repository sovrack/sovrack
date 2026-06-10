'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Globe,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Server,
  Settings2,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { environmentsService } from '@/services/environments.service';
import { serversService } from '@/services/servers.service';
import { projectsService } from '@/services/projects.service';
import { getApiErrorMessage } from '@/lib/api';
import type { Environment, EnvName, EnvironmentServiceTarget } from '@/types/environment';
import type { Server as ServerType } from '@/types/server';
import type { ProjectService } from '@/types/project';
import { EnvConfigsPanel } from './env-configs-panel';

const ENV_BADGE: Record<string, string> = {
  PRODUCTION: 'border-red-500/30 bg-red-500/10 text-red-400',
  STAGING:    'border-blue-500/30 bg-blue-500/10 text-blue-400',
  TESTING:    'border-amber-500/30 bg-amber-500/10 text-amber-400',
  PREVIEW:    'border-purple-500/30 bg-purple-500/10 text-purple-400',
};

const ENV_NAMES: EnvName[] = ['STAGING', 'PRODUCTION', 'TESTING', 'PREVIEW'];

/* ─── Service type badge ──────────────────────────────────────────────────── */
const SERVICE_TYPE_STYLE: Record<string, string> = {
  FRONTEND: 'bg-blue-500/10 text-blue-300',
  BACKEND:  'bg-green-500/10 text-green-300',
  WORKER:   'bg-purple-500/10 text-purple-300',
  DATABASE: 'bg-orange-500/10 text-orange-300',
  STATIC:   'bg-zinc-500/10 text-zinc-300',
  API:      'bg-cyan-500/10 text-cyan-300',
  OTHER:    'bg-zinc-500/10 text-zinc-400',
};

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
              <div className="max-h-48 space-y-2 overflow-y-auto">
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

/* ─── Service Targets Panel ──────────────────────────────────────────────── */

type TargetRow = {
  serverId: string;
  port: string;
  domain: string;
  healthcheckPath: string;
  deploymentMode: 'DOCKER' | 'DOCKER_COMPOSE';
};

export function ServiceTargetsPanel({
  projectId,
  envId,
  services,
  servers,
  existingTargets,
  onSaved,
}: {
  projectId: string;
  envId: string;
  services: ProjectService[];
  servers: ServerType[];
  existingTargets: EnvironmentServiceTarget[];
  onSaved: () => void;
}) {
  const buildInitialState = (): Record<string, TargetRow> => {
    const state: Record<string, TargetRow> = {};
    for (const svc of services) {
      const existing = existingTargets.find((t) => t.serviceId === svc.id);
      state[svc.id] = {
        serverId: existing?.serverId ?? (servers[0]?.id ?? ''),
        port: String(existing?.port ?? '3000'),
        domain: existing?.domain ?? '',
        healthcheckPath: existing?.healthcheckPath ?? '/health',
        deploymentMode: existing?.deploymentMode ?? 'DOCKER',
      };
    }
    return state;
  };

  const [rows, setRows] = useState<Record<string, TargetRow>>(buildInitialState);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const svc of services) {
      init[svc.id] = existingTargets.some((t) => t.serviceId === svc.id);
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const updateRow = (serviceId: string, field: keyof TargetRow, value: string) => {
    setRows((prev) => ({ ...prev, [serviceId]: { ...prev[serviceId], [field]: value } }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const targets = services
        .filter((svc) => enabled[svc.id])
        .map((svc) => {
          const row = rows[svc.id];
          return {
            serviceId: svc.id,
            serverId: row.serverId,
            port: row.port ? parseInt(row.port, 10) : undefined,
            domain: row.domain.trim() || undefined,
            healthcheckPath: row.healthcheckPath.trim() || undefined,
            deploymentMode: row.deploymentMode,
          };
        });
      await environmentsService.upsertTargets(projectId, envId, targets);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onSaved();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (services.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] px-4 py-4 text-center text-xs text-[var(--text-muted)]">
        Aucun service configuré dans ce projet. Ajoutez des services dans l&apos;onglet <strong>Services</strong>.
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Assigner les services à ce VPS
      </p>
      <p className="text-xs text-[var(--text-secondary)]">
        Cochez les services à déployer dans cet environnement et configurez leur port/domaine.
      </p>

      <div className="space-y-2">
        {services.map((svc) => {
          const row = rows[svc.id];
          const isEnabled = enabled[svc.id];
          return (
            <div
              key={svc.id}
              className={clsx(
                'rounded-xl border transition',
                isEnabled
                  ? 'border-[var(--text-primary)]/20 bg-[var(--hover)]'
                  : 'border-[var(--border)] opacity-60',
              )}
            >
              {/* Service header row */}
              <div className="flex items-center gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setEnabled((prev) => ({ ...prev, [svc.id]: e.target.checked }))}
                  className="h-4 w-4 rounded accent-[var(--text-primary)]"
                />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{svc.name}</span>
                  <span className={clsx(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                    SERVICE_TYPE_STYLE[svc.type] ?? SERVICE_TYPE_STYLE.OTHER,
                  )}>
                    {svc.type}
                  </span>
                  {svc.buildPack && svc.buildPack !== 'DOCKERFILE' && (
                    <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                      {svc.buildPack}
                    </span>
                  )}
                </div>
                {!isEnabled && (
                  <span className="text-[10px] text-[var(--text-muted)]">désactivé</span>
                )}
              </div>

              {/* Config fields (only when enabled) */}
              {isEnabled && row && (
                <div className="grid grid-cols-2 gap-2 border-t border-[var(--border)]/50 px-3 pb-3 pt-2 sm:grid-cols-4">
                  {/* VPS selector */}
                  <div className="col-span-2 sm:col-span-1">
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      VPS <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={row.serverId}
                      onChange={(e) => updateRow(svc.id, 'serverId', e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--text-primary)]/30"
                    >
                      {servers.length === 0 && (
                        <option value="">Aucun VPS vérifié</option>
                      )}
                      {servers.map((srv) => (
                        <option key={srv.id} value={srv.id}>
                          {srv.name} ({srv.host})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Port */}
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Port <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="number"
                      value={row.port}
                      onChange={(e) => updateRow(svc.id, 'port', e.target.value)}
                      min={1}
                      max={65535}
                      placeholder="3000"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--text-primary)]/30"
                    />
                  </div>

                  {/* Domain */}
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Domaine
                    </label>
                    <input
                      type="text"
                      value={row.domain}
                      onChange={(e) => updateRow(svc.id, 'domain', e.target.value)}
                      placeholder="app.monsite.io"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--text-primary)]/30"
                    />
                  </div>

                  {/* Healthcheck */}
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Healthcheck
                    </label>
                    <input
                      type="text"
                      value={row.healthcheckPath}
                      onChange={(e) => updateRow(svc.id, 'healthcheckPath', e.target.value)}
                      placeholder="/health"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--text-primary)]/30"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-400">
          <CheckCircle2 size={13} /> Service targets sauvegardés avec succès.
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving || servers.length === 0}
        className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-40"
      >
        {saving ? <><Loader2 size={12} className="animate-spin" /> Sauvegarde…</> : <><CheckCircle2 size={12} /> Sauvegarder les assignations</>}
      </button>
    </div>
  );
}

/* ─── Global Variables Section ──────────────────────────────────────────── */

import { ProjectConfigsTab } from './project-configs-tab';

function GlobalVariablesSection({ projectId }: { projectId: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--hover)]">
          <KeyRound size={14} className="text-[var(--text-secondary)]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Global environment variables</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Injected into every deployment regardless of environment. Per-environment overrides are managed below.
          </p>
        </div>
      </div>
      <ProjectConfigsTab projectId={projectId} />
    </div>
  );
}

/* ─── Inline domain editor ─────────────────────────────────────────────── */

function DomainEditor({ env, projectId, onSaved }: {
  env: Environment;
  projectId: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(env.domain ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await environmentsService.update(projectId, env.id, { domain: value || undefined });
      setEditing(false);
      onSaved();
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  if (!editing) {
    return (
      <span className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--hover)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
        <Globe size={9} />
        {env.domain ?? 'No domain'}
        <button type="button" onClick={() => { setValue(env.domain ?? ''); setEditing(true); }}
          className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <Pencil size={8} />
        </button>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="app.example.com"
        autoFocus
        className="w-32 rounded border border-[var(--border)] bg-[var(--bg-app)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-primary)] outline-none"
      />
      <button type="button" onClick={() => void handleSave()} disabled={saving}
        className="text-[10px] text-green-400 hover:text-green-300">
        {saving ? <Loader2 size={8} className="animate-spin" /> : <Save size={8} />}
      </button>
      <button type="button" onClick={() => setEditing(false)}
        className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        <X size={8} />
      </button>
    </div>
  );
}

/* ─── Main tab ───────────────────────────────────────────────────────────── */

type Props = { projectId: string; onChanged?: () => void; onDeploy?: (envId?: string) => void; compact?: boolean };

export function ProjectEnvironmentsTab({ projectId, onChanged, onDeploy, compact = false }: Props) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [services, setServices] = useState<ProjectService[]>([]);
  const [servers, setServers] = useState<ServerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [configsOpenId, setConfigsOpenId] = useState<string | null>(null);
  const [targetsOpenId, setTargetsOpenId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      environmentsService.getAll(projectId),
      projectsService.getServices(projectId).catch(() => [] as ProjectService[]),
      serversService.getAll().catch(() => [] as ServerType[]),
    ])
      .then(([envs, svcs, srvs]) => {
        setEnvironments(envs);
        setServices(svcs);
        setServers(srvs.filter((s) => s.isVerified));
      })
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
    <div className="space-y-4">
      <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">
          {environments.length} environnement{environments.length !== 1 ? 's' : ''} · {services.length} service{services.length !== 1 ? 's' : ''}
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

      {/* Tip when services exist but no env configured */}
      {environments.length === 0 && services.length > 0 && !error && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
          <strong>Astuce :</strong> Tu as {services.length} service{services.length > 1 ? 's' : ''} configuré{services.length > 1 ? 's' : ''}. Crée un environnement (ex: STAGING) et assigne chaque service à un VPS + port pour pouvoir déployer.
        </div>
      )}

      {environments.length === 0 && !error && services.length === 0 && (
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

      {environments.map((env) => {
        const targetsOpen = targetsOpenId === env.id;
        const configuredCount = env.serviceTargets?.length ?? 0;
        const unconfiguredCount = services.length - configuredCount;

        return (
          <div key={env.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            {/* Environment header */}
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
                {!compact && <DomainEditor env={env} projectId={projectId} onSaved={load} />}

                {/* Assign services button — hidden in compact mode */}
                {!compact && services.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTargetsOpenId(targetsOpen ? null : env.id)}
                    className={clsx(
                      'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition',
                      targetsOpen
                        ? 'border-[var(--text-primary)]/30 bg-[var(--hover)] text-[var(--text-primary)]'
                        : unconfiguredCount > 0
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                          : 'border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/20',
                    )}
                    title="Assigner les services à des VPS"
                  >
                    <Settings2 size={11} />
                    Services ({configuredCount}/{services.length})
                    {targetsOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  </button>
                )}

                {!compact && (
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
                )}
                {!compact && onDeploy && (env.serverId ?? env.server?.id) && (
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

            {/* Service targets summary (hidden in compact mode) */}
            {!compact && (env.serviceTargets ?? []).length > 0 && !targetsOpen && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
                {(env.serviceTargets ?? []).map((target) => (
                  <div key={target.id} className="flex items-center gap-1.5 rounded-lg border border-green-500/20 bg-green-500/8 px-2.5 py-1 text-xs">
                    <CheckCircle2 size={10} className="text-green-400" />
                    <span className="font-semibold text-[var(--text-primary)]">{target.service?.name ?? target.serviceId}</span>
                    {target.port && <span className="font-mono text-[var(--text-muted)]">:{target.port}</span>}
                    {target.domain && <span className="font-mono text-[var(--text-muted)]">{target.domain}</span>}
                  </div>
                ))}
                {unconfiguredCount > 0 && (
                  <div className="flex items-center gap-1 rounded-lg border border-amber-500/20 bg-amber-500/8 px-2.5 py-1 text-xs text-amber-400">
                    {unconfiguredCount} service{unconfiguredCount > 1 ? 's' : ''} non assigné{unconfiguredCount > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )}

            {/* No targets warning (hidden in compact mode) */}
            {!compact && services.length > 0 && (env.serviceTargets ?? []).length === 0 && !targetsOpen && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <Settings2 size={12} />
                Aucun service assigné — cliquez sur <strong>Services ({configuredCount}/{services.length})</strong> pour configurer.
              </div>
            )}

            {/* Service targets panel (expandable, hidden in compact mode) */}
            {!compact && targetsOpen && (
              <ServiceTargetsPanel
                projectId={projectId}
                envId={env.id}
                services={services}
                servers={servers}
                existingTargets={env.serviceTargets ?? []}
                onSaved={load}
              />
            )}

            {/* Variables panel (hidden in compact mode) */}
            {!compact && configsOpenId === env.id && (
              <EnvConfigsPanel
                projectId={projectId}
                environmentId={env.id}
                onClose={() => setConfigsOpenId(null)}
              />
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
