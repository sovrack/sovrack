'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Globe, Plus, Trash2, Loader2,
  CheckCircle, XCircle, RefreshCw,
} from 'lucide-react';
import { environmentsService } from '@/services/environments.service';
import { serversService } from '@/services/servers.service';
import { useAuth } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/api';
import clsx from 'clsx';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import type { Environment, EnvName, CreateEnvironmentPayload } from '@/types/environment';
import type { Server } from '@/types/server';

type Props = { params: Promise<{ id: string }> };

export default function EnvironmentsPage({ params }: Props) {
  const { id: projectId } = use(params);
  const { isAdmin } = useAuth();
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const envs = await environmentsService.getAll(projectId);
      setEnvironments(envs);
      const states: Record<string, { autoDeploy: boolean; branch: string }> = {};
      envs.forEach((e) => { states[e.id] = { autoDeploy: e.autoDeploy, branch: e.autoDeployBranch ?? 'main' }; });
      setAutoDeployStates(states);

      if (isAdmin) {
        const svrs = await serversService.getAll();
        const verified = svrs.filter((s) => s.isVerified);
        setServers(verified);
        if (verified.length > 0) {
          setServerId(verified[0].id);
        }
      } else {
        setServers([]);
        setShowForm(false);
      }
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
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowForm((v) => !v)}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-indigo-700"
              >
                <Plus size={16} /> New Environment
              </button>
            )}
          </>
        }
      />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {!isAdmin && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          Only admins can create, update or delete environments.
        </div>
      )}

      {showForm && isAdmin && (
        <SectionCard title="New Environment" description="Create a deployment target and link it to a verified server.">
          <form onSubmit={handleCreate} className="space-y-4">
          {formError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Environment</label>
              <select value={envName} onChange={(e) => setEnvName(e.target.value as EnvName)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                <option value="STAGING">STAGING</option>
                <option value="PRODUCTION">PRODUCTION</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                Server <span className="text-red-400">*</span>
              </label>
              {verifiedServers.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                  No verified servers available.{' '}
                  <Link href="/admin/servers" className="font-semibold underline">Add one in Admin → Servers</Link>
                </div>
              ) : (
                <select value={serverId} onChange={(e) => setServerId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                  {verifiedServers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} — {s.host}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Domain (optional)</label>
              <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)}
                placeholder="staging.myapp.com"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setShowForm(false)}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !serverId}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60">
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
          {[1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      ) : environments.length === 0 ? (
        <SectionCard>
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center dark:border-slate-700 dark:bg-slate-900">
            <Globe size={28} className="text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-500">No environments yet</p>
            <p className="mt-1 text-xs text-slate-400">Create STAGING or PRODUCTION and link them to a server.</p>
          </div>
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {environments.map((env) => (
            <div key={env.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={clsx('flex h-9 w-9 items-center justify-center rounded-xl',
                    env.name === 'PRODUCTION' ? 'bg-red-50' : 'bg-blue-50')}>
                    <Globe size={16} className={env.name === 'PRODUCTION' ? 'text-red-500' : 'text-blue-500'} />
                  </div>
                  <div>
                    <span className={clsx('text-xs font-bold uppercase tracking-widest',
                      env.name === 'PRODUCTION' ? 'text-red-600' : 'text-blue-600')}>
                      {env.name}
                    </span>
                    <p className="text-sm font-semibold text-slate-900">{env.server.name}</p>
                  </div>
                </div>
                {isAdmin && (
                  <button onClick={() => void handleDelete(env.id, env.name)} disabled={deletingId === env.id}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50">
                    {deletingId === env.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>
              <div className="mt-3 space-y-1 text-xs text-slate-500">
                <p className="font-mono">{env.server.username}@{env.server.host}:{env.server.port}</p>
                {env.domain && <p className="text-indigo-600">{env.domain}</p>}
                <div className="flex items-center gap-1.5 pt-1">
                  {env.server.hasDocker
                    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><CheckCircle size={10} />Docker</span>
                    : <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600"><XCircle size={10} />No Docker</span>
                  }
                </div>
                {isAdmin && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-600">Auto-deploy</span>
                      <button
                        onClick={() => void handleAutoDeployToggle(env.id)}
                        className={clsx(
                          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                          autoDeployStates[env.id]?.autoDeploy ? 'bg-indigo-600' : 'bg-slate-200',
                        )}
                      >
                        <span className={clsx(
                          'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                          autoDeployStates[env.id]?.autoDeploy ? 'translate-x-4' : 'translate-x-0.5',
                        )} />
                      </button>
                    </div>
                    {autoDeployStates[env.id]?.autoDeploy && (
                      <div className="mt-2">
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Branche</label>
                        <input
                          type="text"
                          value={autoDeployStates[env.id]?.branch ?? 'main'}
                          onChange={(e) => void handleAutoDeployBranchChange(env.id, e.target.value)}
                          placeholder="main"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                        />
                      </div>
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
