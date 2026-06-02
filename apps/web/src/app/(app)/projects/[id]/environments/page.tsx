'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Globe, Plus, Trash2, Loader2,
  CheckCircle, XCircle, RefreshCw,
} from 'lucide-react';
import { environmentsService } from '@/services/environments.service';
import { projectsService } from '@/services/projects.service';
import { serversService } from '@/services/servers.service';
import { useAuth } from '@/hooks/auth/use-auth';
import { getApiErrorMessage } from '@/lib/api';
import clsx from 'clsx';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import type { Environment, EnvName, CreateEnvironmentPayload } from '@/types/environment';
import type { ProjectService } from '@/types/project';
import type { Server } from '@/types/server';

type Props = { params: Promise<{ id: string }> };

export default function EnvironmentsPage({ params }: Props) {
  const { id: projectId } = use(params);
  const { isAdmin } = useAuth();
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [services, setServices] = useState<ProjectService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [envName, setEnvName] = useState<EnvName>('STAGING');
  const [serverId, setServerId] = useState('');
  const [domain, setDomain] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [autoDeployStates, setAutoDeployStates] = useState<Record<string, { autoDeploy: boolean; branch: string }>>({});
  const [targetDrafts, setTargetDrafts] = useState<Record<string, Record<string, { serverId: string; port: string; domain: string }>>>({});
  const [savingTargetsId, setSavingTargetsId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [envs, projectServices] = await Promise.all([
        environmentsService.getAll(projectId),
        projectsService.getServices(projectId).catch(() => []),
      ]);
      setEnvironments(envs);
      setServices(projectServices);
      const states: Record<string, { autoDeploy: boolean; branch: string }> = {};
      envs.forEach((e) => { states[e.id] = { autoDeploy: e.autoDeploy, branch: e.autoDeployBranch ?? 'main' }; });
      setAutoDeployStates(states);

      let verified: Server[] = [];
      if (isAdmin) {
        const svrs = await serversService.getAll();
        verified = svrs.filter((s) => s.isVerified);
        setServers(verified);
        if (verified.length > 0) {
          setServerId(verified[0].id);
        }
      } else {
        setServers([]);
        setShowForm(false);
      }

      const drafts: Record<string, Record<string, { serverId: string; port: string; domain: string }>> = {};
      envs.forEach((env) => {
        drafts[env.id] = {};
        projectServices.forEach((service) => {
          const target = env.serviceTargets?.find((item) => item.serviceId === service.id);
          drafts[env.id][service.id] = {
            serverId: target?.serverId ?? env.serverId ?? verified[0]?.id ?? '',
            port: target?.port ? String(target.port) : '',
            domain: target?.domain ?? '',
          };
        });
      });
      setTargetDrafts(drafts);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, projectId]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) { setFormError('Action reservee aux administrateurs.'); return; }
    if (!serverId) { setFormError('Please select a verified server.'); return; }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload: CreateEnvironmentPayload = {
        name: envName,
        serverId,
        domain: domain.trim() || undefined,
      };
      await environmentsService.create(projectId, payload);
      setShowForm(false);
      setDomain('');
      await fetchData();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAutoDeployToggle = async (envId: string) => {
    if (!isAdmin) return;
    const current = autoDeployStates[envId];
    if (!current) return;
    const next = { ...current, autoDeploy: !current.autoDeploy };
    setAutoDeployStates((prev) => ({ ...prev, [envId]: next }));
    try {
      await environmentsService.update(projectId, envId, {
        autoDeploy: next.autoDeploy,
        autoDeployBranch: next.branch,
      });
    } catch (err) {
      setAutoDeployStates((prev) => ({ ...prev, [envId]: current }));
      alert(getApiErrorMessage(err));
    }
  };

  const handleAutoDeployBranchChange = async (envId: string, branch: string) => {
    if (!isAdmin) return;
    setAutoDeployStates((prev) => ({ ...prev, [envId]: { ...prev[envId], branch } }));
    try {
      await environmentsService.update(projectId, envId, { autoDeployBranch: branch });
    } catch (err) {
      alert(getApiErrorMessage(err));
    }
  };

  const handleDelete = async (envId: string, name: string) => {
    if (!isAdmin) return;
    if (!confirm(`Delete environment "${name}"?`)) return;
    setDeletingId(envId);
    try {
      await environmentsService.remove(projectId, envId);
      setEnvironments((prev) => prev.filter((e) => e.id !== envId));
    } catch (err) {
      alert(getApiErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const handleTargetDraftChange = (
    envId: string,
    serviceId: string,
    patch: Partial<{ serverId: string; port: string; domain: string }>,
  ) => {
    setTargetDrafts((prev) => ({
      ...prev,
      [envId]: {
        ...prev[envId],
        [serviceId]: {
          ...(prev[envId]?.[serviceId] ?? { serverId: '', port: '', domain: '' }),
          ...patch,
        },
      },
    }));
  };

  const handleSaveTargets = async (env: Environment) => {
    if (!isAdmin) return;
    const drafts = targetDrafts[env.id] ?? {};
    const targets = services.map((service) => {
      const draft = drafts[service.id];
      return {
        serviceId: service.id,
        serverId: draft?.serverId || env.serverId,
        deploymentMode: 'DOCKER_COMPOSE' as const,
        port: draft?.port ? Number(draft.port) : undefined,
        domain: draft?.domain?.trim() || undefined,
        healthcheckPath: '/health',
        replicas: 1,
      };
    });

    if (targets.some((target) => !target.serverId)) {
      alert('Chaque service doit avoir un VPS cible.');
      return;
    }

    setSavingTargetsId(env.id);
    try {
      await environmentsService.upsertTargets(projectId, env.id, targets);
      await fetchData();
    } catch (err) {
      alert(getApiErrorMessage(err));
    } finally {
      setSavingTargetsId(null);
    }
  };

  const verifiedServers = servers;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project"
        title="Environments"
        description={
          isAdmin
            ? 'Link environments to verified servers for deployment.'
            : 'Read-only view. Environment management is restricted to admins.'
        }
        actions={
          <>
            <button
              onClick={() => void fetchData()}
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
                <Plus size={16} /> New Environment
              </button>
            )}
          </>
        }
      />

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {!isAdmin && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--text-primary)]/10 px-4 py-3 text-sm text-[var(--text-secondary)]">
          Only admins can create, update or delete environments.
        </div>
      )}

      {showForm && isAdmin && (
        <SectionCard title="New Environment" description="Create a deployment target and link it to a verified server.">
          <form onSubmit={handleCreate} className="space-y-4">
          {formError && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{formError}</div>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">Environment</label>
              <select value={envName} onChange={(e) => setEnvName(e.target.value as EnvName)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20">
                <option value="STAGING">STAGING</option>
                <option value="PRODUCTION">PRODUCTION</option>
                <option value="TESTING">TESTING</option>
                <option value="PREVIEW">PREVIEW</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                Server <span className="text-red-400">*</span>
              </label>
              {verifiedServers.length === 0 ? (
                <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-xs text-yellow-300">
                  No verified servers available.{' '}
                  <Link href="/admin/servers" className="font-semibold underline">Add one in Admin → Servers</Link>
                </div>
              ) : (
                <select value={serverId} onChange={(e) => setServerId(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20">
                  {verifiedServers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} — {s.host}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">Domain (optional)</label>
              <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)}
                placeholder="staging.myapp.com"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20" />
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setShowForm(false)}
              className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-card)]/10">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !serverId}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-60">
              {submitting && <Loader2 size={15} className="animate-spin" />}
              Create
            </button>
          </div>
          </form>
        </SectionCard>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--bg-card)]/10" />)}
        </div>
      ) : environments.length === 0 ? (
        <SectionCard>
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-card)]/5 py-14 text-center">
            <Globe size={28} className="text-[var(--text-primary)]" />
            <p className="mt-3 text-sm font-medium text-[var(--text-secondary)]">No environments yet</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Create STAGING or PRODUCTION and link them to a server.</p>
          </div>
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {environments.map((env) => (
            <div key={env.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={clsx('flex h-9 w-9 items-center justify-center rounded-xl',
                    env.name === 'PRODUCTION' ? 'bg-red-500/15' : 'bg-[var(--text-primary)]/15')}>
                    <Globe size={16} className={env.name === 'PRODUCTION' ? 'text-red-300' : 'text-[var(--text-secondary)]'} />
                  </div>
                  <div>
                    <span className={clsx('text-xs font-bold uppercase tracking-widest',
                      env.name === 'PRODUCTION' ? 'text-red-300' : 'text-[var(--text-secondary)]')}>
                      {env.name}
                    </span>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{env.server.name}</p>
                  </div>
                </div>
                {isAdmin && (
                  <button onClick={() => void handleDelete(env.id, env.name)} disabled={deletingId === env.id}
                    className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50">
                    {deletingId === env.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>
              <div className="mt-3 space-y-1 text-xs text-[var(--text-secondary)]">
                <p className="font-mono">{env.server.username}@{env.server.host}:{env.server.port}</p>
                {env.domain && <p className="text-[var(--text-secondary)]">{env.domain}</p>}
                <div className="flex items-center gap-1.5 pt-1">
                  {env.server.hasDocker
                    ? <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-300"><CheckCircle size={10} />Docker</span>
                    : <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-300"><XCircle size={10} />No Docker</span>
                  }
                </div>
                {isAdmin && (
                  <div className="mt-3 border-t border-[var(--border)] pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--text-secondary)]">Auto-deploy</span>
                      <button
                        onClick={() => void handleAutoDeployToggle(env.id)}
                        className={clsx(
                          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                          autoDeployStates[env.id]?.autoDeploy ? 'bg-[var(--text-primary)]' : 'bg-[var(--bg-card)]/15',
                        )}
                      >
                        <span className={clsx(
                          'inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--bg-card)] shadow transition-transform',
                          autoDeployStates[env.id]?.autoDeploy ? 'translate-x-4' : 'translate-x-0.5',
                        )} />
                      </button>
                    </div>
                    {autoDeployStates[env.id]?.autoDeploy && (
                      <div className="mt-2">
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Branche</label>
                        <input
                          type="text"
                          value={autoDeployStates[env.id]?.branch ?? 'main'}
                          onChange={(e) => void handleAutoDeployBranchChange(env.id, e.target.value)}
                          placeholder="main"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)]/5 px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border)] focus:ring-1 focus:ring-zinc-500/20"
                        />
                      </div>
                    )}
                  </div>
                )}
                {services.length > 0 && (
                  <div className="mt-3 border-t border-[var(--border)] pt-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-[var(--text-primary)]">Service targets</p>
                        <p className="text-[10px] text-[var(--text-secondary)]">
                          Same VPS is recommended for POC/low cost. Separate VPS gives better production isolation.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-300">Recommended for POC</span>
                        <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-300">Better isolation</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {services.map((service) => {
                        const draft = targetDrafts[env.id]?.[service.id];
                        const target = env.serviceTargets?.find((item) => item.serviceId === service.id);
                        return (
                          <div key={service.id} className="rounded-xl border border-[var(--border)] bg-[var(--hover)] p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-[var(--text-primary)]">{service.name}</span>
                              <span className="rounded-full bg-[var(--bg-card)]/20 px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">{service.type}</span>
                            </div>
                            {isAdmin ? (
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                <select
                                  value={draft?.serverId ?? env.serverId}
                                  onChange={(e) => handleTargetDraftChange(env.id, service.id, { serverId: e.target.value })}
                                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)]/5 px-2 py-2 text-xs text-[var(--text-primary)] outline-none"
                                >
                                  {verifiedServers.map((server) => (
                                    <option key={server.id} value={server.id}>{server.name} — {server.host}</option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  min={1}
                                  value={draft?.port ?? ''}
                                  onChange={(e) => handleTargetDraftChange(env.id, service.id, { port: e.target.value })}
                                  placeholder="Port"
                                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)]/5 px-2 py-2 text-xs text-[var(--text-primary)] outline-none"
                                />
                                <input
                                  type="text"
                                  value={draft?.domain ?? ''}
                                  onChange={(e) => handleTargetDraftChange(env.id, service.id, { domain: e.target.value })}
                                  placeholder="service.example.com"
                                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)]/5 px-2 py-2 text-xs text-[var(--text-primary)] outline-none"
                                />
                              </div>
                            ) : (
                              <p className="text-[11px] text-[var(--text-secondary)]">
                                {target
                                  ? `${target.server.name} · ${target.domain ?? env.domain ?? 'no domain'} · ${target.port ?? 'default port'}`
                                  : 'No service target configured'}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => void handleSaveTargets(env)}
                        disabled={savingTargetsId === env.id || verifiedServers.length === 0}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-3 py-2 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-60"
                      >
                        {savingTargetsId === env.id && <Loader2 size={13} className="animate-spin" />}
                        Save service targets
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
