'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Layers,
  Loader2,
  Rocket,
  Wrench,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { deploymentsService } from '@/services/deployments.service';
import { environmentsService } from '@/services/environments.service';
import { projectsService } from '@/services/projects.service';
import { serversService } from '@/services/servers.service';
import { buildService } from '@/services/build.service';
import { useServerPreparationOptions } from '@/hooks/servers/use-servers';
import { getApiErrorMessage } from '@/lib/api';
import { ServerPreparationPanel } from './server-preparation-panel';
import type { Environment } from '@/types/environment';
import type { GitlabBranch } from '@/types/project';
import type { Service } from '@/types/service';
import type { BuildSource, DeployValidationResult } from '@/types/deployment';

type ValidationIssue = {
  type: 'no-source' | 'no-build-config' | 'no-environment' | 'no-branch';
  message: string;
  redirectTab: string;
};

type ToolCheckItem = {
  binary: string;
  label: string;
  role: string;
  found: boolean;
};

type Props = {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  services?: Service[];
  initialServiceId?: string;
  initialEnvironmentId?: string;
  initialBranch?: string;
  defaultBuildSource?: string | null;
  buildPort?: number | null;
  buildStartCmd?: string | null;
};

const LOCAL_BUILD_SOURCES = ['DOCKERFILE_LOCAL', 'NIXPACKS_LOCAL', 'DOCKER_COMPOSE', 'STATIC'] as const;

const BUILD_SOURCE_META: Record<string, { label: string; detail: string; color: string; bg: string; border: string }> = {
  DOCKERFILE_LOCAL:    { label: 'Dockerfile',   detail: 'build local sur le VPS',       color: 'text-blue-400',   bg: 'bg-blue-500/8',   border: 'border-blue-500/20' },
  DOCKERFILE_REGISTRY: { label: 'Dockerfile',   detail: 'build CI → push registry',     color: 'text-indigo-400', bg: 'bg-indigo-500/8', border: 'border-indigo-500/20' },
  NIXPACKS_LOCAL:      { label: 'Nixpacks',     detail: 'build local sur le VPS',       color: 'text-teal-400',   bg: 'bg-teal-500/8',   border: 'border-teal-500/20' },
  NIXPACKS_REGISTRY:   { label: 'Nixpacks',     detail: 'build CI → push registry',     color: 'text-cyan-400',   bg: 'bg-cyan-500/8',   border: 'border-cyan-500/20' },
  DOCKER_COMPOSE:      { label: 'Compose',      detail: 'docker compose sur le VPS',    color: 'text-purple-400', bg: 'bg-purple-500/8', border: 'border-purple-500/20' },
  STATIC:              { label: 'Static',       detail: 'fichiers statiques',            color: 'text-green-400',  bg: 'bg-green-500/8',  border: 'border-green-500/20' },
  EXTERNAL_IMAGE:      { label: 'Image externe','detail': 'image Docker pré-construite', color: 'text-orange-400', bg: 'bg-orange-500/8', border: 'border-orange-500/20' },
};

export function DeployDialog({ projectId, open, onClose, onCreated, services = [], initialServiceId, initialEnvironmentId, initialBranch, defaultBuildSource, buildPort, buildStartCmd }: Props) {
  const effectiveBuildSource = (defaultBuildSource ?? 'DOCKERFILE_LOCAL') as BuildSource;
  const isLocalBuild = (LOCAL_BUILD_SOURCES as readonly string[]).includes(effectiveBuildSource);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [branches, setBranches] = useState<GitlabBranch[]>([]);
  const [hasBuildConfig, setHasBuildConfig] = useState(false);
  const [hasSource, setHasSource] = useState(false);
  const [envIds, setEnvIds] = useState<string[]>([]);
  const [branch, setBranch] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState(initialServiceId ?? '');

  const toggleEnvId = (id: string) =>
    setEnvIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [validation, setValidation] = useState<DeployValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);

  const [showPrepare, setShowPrepare] = useState(false);
  const [prepareDone, setPrepareDone] = useState(false);
  const optionsQuery = useServerPreparationOptions();

  const primaryEnvId = envIds[0] ?? '';
  const currentEnv = environments.find((e) => e.id === primaryEnvId);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError(null); setSuccess(false); setIssues([]);
    setValidation(null); setValidateError(null); setShowPrepare(false);
    if (initialServiceId) setSelectedServiceId(initialServiceId);

    // Pre-fill branch : initialBranch explicite (ex: redeploy) > defaut du service
    if (initialBranch) {
      setBranch(initialBranch);
    } else if (initialServiceId && services.length > 0) {
      const svc = services.find((s) => s.id === initialServiceId);
      if (svc?.branch) setBranch(svc.branch);
    }

    Promise.all([
      environmentsService.getAll(projectId),
      projectsService.getBranches(projectId).catch(() => [] as GitlabBranch[]),
      projectsService.getGitlabConfig(projectId).catch(() => null),
      buildService.getBuildStatus(projectId).catch(() => null),
    ])
      .then(([envs, brs, gitlabConfig, buildStatus]) => {
        if (cancelled) return;
        setEnvironments(envs);
        setBranches(brs);
        setHasSource(!!gitlabConfig);
        const buildConfigReady = isLocalBuild
          ? !!gitlabConfig
          : !!(buildStatus?.projectDockerfileReady && buildStatus?.projectCiReady);
        setHasBuildConfig(buildConfigReady);

        // Pre-select: use initialEnvironmentId if provided, else first env
        if (initialEnvironmentId && envs.some((e) => e.id === initialEnvironmentId)) {
          setEnvIds([initialEnvironmentId]);
        } else {
          setEnvIds(envs.length > 0 ? [envs[0].id] : []);
        }
        const def = brs.find((b) => b.default);
        setBranch(initialBranch ?? def?.name ?? brs[0]?.name ?? 'main');

        const detected: ValidationIssue[] = [];
        if (!gitlabConfig) detected.push({ type: 'no-source', message: 'Git source not connected.', redirectTab: 'services' });
        if (!buildConfigReady) detected.push({ type: 'no-build-config', message: 'Build configuration not complete.', redirectTab: 'services' });
        if (envs.length === 0) detected.push({ type: 'no-environment', message: 'No environment configured.', redirectTab: 'environments' });
        setIssues(detected);
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, projectId]);

  useEffect(() => {
    if (!open || loading || issues.some((i) => i.type === 'no-environment') || !primaryEnvId) {
      setValidation(null);
      return;
    }

    let cancelled = false;
    setValidating(true);
    setValidateError(null);

    deploymentsService.validate(projectId, primaryEnvId, effectiveBuildSource)
      .then((result) => { if (!cancelled) setValidation(result); })
      .catch((err) => { if (!cancelled) setValidateError(getApiErrorMessage(err)); })
      .finally(() => { if (!cancelled) setValidating(false); });

    return () => { cancelled = true; };
  }, [open, loading, primaryEnvId, projectId]);

  const handleSubmit = async () => {
    if (envIds.length === 0) { setError('Select at least one environment.'); return; }
    setSubmitting(true); setError(null);
    try {
      const targets: { serviceEnvId: string; branch: string }[] = [];
      for (const eid of envIds) {
        const env = environments.find((e) => e.id === eid);
        if (!env) continue;
        const links = env.serviceLinks ?? [];
        if (selectedServiceId) {
          const link = links.find((l) => l.serviceId === selectedServiceId);
          if (link) targets.push({ serviceEnvId: link.id, branch: branch || link.service.branch || 'main' });
        } else {
          for (const link of links) {
            targets.push({ serviceEnvId: link.id, branch: branch || link.service.branch || 'main' });
          }
        }
      }
      if (targets.length === 0) { setError('No deployable services found for selected environments.'); return; }
      const results = await Promise.allSettled(
        targets.map((t) => deploymentsService.create({ serviceEnvId: t.serviceEnvId, branch: t.branch }))
      );
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        const reasons = failed.map((r) => getApiErrorMessage((r as PromiseRejectedResult).reason)).join('; ');
        setError(failed.length === targets.length ? reasons : `Some deployments failed: ${reasons}`);
      } else {
        setSuccess(true);
        setTimeout(() => { onClose(); onCreated(); }, 800);
      }
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const profiles = optionsQuery.data?.profiles ?? [];
  const allOptions = optionsQuery.data?.options ?? [];
  const profileDefaults = optionsQuery.data?.profileDefaults ?? {};

  if (!open) return null;

  const missing = validation?.missing ?? [];
  const ready = validation?.ready ?? true;
  const canDeploy = !loading && !submitting && envIds.length > 0 && issues.length === 0 && (ready || missing.length === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {showPrepare ? 'Prepare Server' : 'Deploy'}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {showPrepare
                ? 'Prepare server environment'
                : 'Launch a new deployment'}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]">
            <X size={13} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* Success */}
          {success && (
            <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-400">
              <CheckCircle2 size={16} /> Deployment launched! Redirecting to History…
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
          )}

          {showPrepare ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
              <AlertTriangle size={14} className="inline mr-1" />
              Server preparation no longer available in this view. Configure servers in Admin → Servers.
            </div>
          ) : (
            /* ════════ DEPLOY FORM ════════ */
            <>
              {/* Validation issues (source, build config, env) */}
              {issues.length > 0 && !loading && (
                <div className="space-y-2">
                  {issues.map((issue, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={14} className="shrink-0 text-amber-400" />
                        <span className="text-xs text-amber-300">{issue.message}</span>
                      </div>
                      <Link
                        href={`/projects/${projectId}?tab=${issue.redirectTab}`}
                        onClick={onClose}
                        className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/20 px-2.5 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/30"
                      >
                        Configure →
                      </Link>
                    </div>
                  ))}
                </div>
              )}

              {/* Tool validation (for primary selected env) */}
              {!loading && envIds.length > 0 && (
                <div className="space-y-2">
                  {validating && (
                    <div className="flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-xs text-blue-300">
                      <Loader2 size={14} className="animate-spin" />
                      Checking server tools…
                    </div>
                  )}
                  {validateError && !validating && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                      Validation error: {validateError}
                    </div>
                  )}
                  {validation && !validating && missing.length > 0 && (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                        <AlertTriangle size={14} />
                        Missing tools on {validation.serverName}
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {validation.required.map((req) => {
                          const isMissing = missing.some((m) => m.binary === req.binary);
                          return (
                            <div key={req.binary} className="flex items-center gap-2 text-xs">
                              {isMissing ? (
                                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500/20 text-[10px] text-red-400">✕</span>
                              ) : (
                                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500/20 text-[10px] text-green-400">✓</span>
                              )}
                              <span className={isMissing ? 'text-red-300' : 'text-green-300'}>{req.label}</span>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPrepare(true)}
                        className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/20 px-3 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/30"
                      >
                        <Wrench size={12} /> Prepare server
                      </button>
                    </div>
                  )}
                  {validation && !validating && missing.length === 0 && (
                    <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-xs text-green-400">
                      <CheckCircle2 size={14} />
                      All required tools are installed on {validation.serverName}
                    </div>
                  )}
                </div>
              )}

              {!loading && defaultBuildSource && (
                /* ── Build configuration summary ── */
                (() => {
                  const meta = BUILD_SOURCE_META[effectiveBuildSource] ?? BUILD_SOURCE_META['DOCKERFILE_LOCAL'];
                  const selectedEnvs = environments.filter((e) => envIds.includes(e.id));
                  return (
                    <div className={`rounded-xl border ${meta.border} ${meta.bg} px-4 py-3 space-y-2`}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        Configuration qui sera utilisée
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {/* Build source */}
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold uppercase ${meta.color}`}>Build</span>
                          <span className={`rounded border ${meta.border} px-2 py-0.5 text-[10px] font-semibold ${meta.color}`}>
                            {meta.label}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)]">— {meta.detail}</span>
                        </div>
                        {/* Port */}
                        {(buildPort ?? null) !== null && (
                          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                            <span className="font-semibold text-[var(--text-secondary)]">Port</span>
                            <span className="font-mono">{buildPort}</span>
                          </div>
                        )}
                        {/* Start command */}
                        {buildStartCmd && (
                          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                            <span className="font-semibold text-[var(--text-secondary)]">Cmd</span>
                            <code className="font-mono">{buildStartCmd}</code>
                          </div>
                        )}
                      </div>
                      {/* Per-env server display */}
                      {selectedEnvs.length > 0 && (
                        <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-2">
                          {selectedEnvs.map((env) => (
                            <div key={env.id} className="flex items-center gap-1.5 text-[10px]">
                              <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 font-bold uppercase text-[var(--text-muted)]">{env.name}</span>
                              <span className="font-mono text-[var(--text-secondary)]">{env.serviceLinks?.length ?? 0} service{(env.serviceLinks?.length ?? 0) > 1 ? 's' : ''}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-[10px] text-[var(--text-muted)]">
                        ← Modifiable dans <strong>Configuration → Build / Environments</strong>
                      </p>
                    </div>
                  );
                })()
              )}

              {loading ? (
                <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-[var(--text-muted)]" /></div>
              ) : (
                <>
                  {/* Environment — multi-select */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                      Environment <span className="font-normal normal-case text-[var(--text-muted)]">(select one or more)</span>
                    </label>
                    {environments.length === 0 ? (
                      <p className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-xs text-amber-300">
                        No environments. Create one in{' '}
                        <Link href={`/projects/${projectId}?tab=environments`} onClick={onClose}
                          className="font-semibold underline">Environments</Link>.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {environments.map((env) => {
                          const selected = envIds.includes(env.id);
                          return (
                            <button
                              key={env.id}
                              type="button"
                              onClick={() => toggleEnvId(env.id)}
                              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                                selected
                                  ? 'border-[var(--text-primary)]/30 bg-[var(--text-primary)]/10 text-[var(--text-primary)]'
                                  : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              {selected ? <CheckCircle2 size={12} /> : <span className="h-3 w-3 rounded-full border border-current opacity-40" />}
                              {env.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {envIds.length > 1 && (
                      <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
                        {envIds.length} environments selected — one deployment per environment will be created.
                      </p>
                    )}
                  </div>

                  {/* Service (for GROUP sources) */}
                  {services.length > 0 && (
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                        Service
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setSelectedServiceId('')}
                          className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                            selectedServiceId === ''
                              ? 'border-[var(--text-primary)]/30 bg-[var(--text-primary)]/10 text-[var(--text-primary)]'
                              : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                          }`}>
                          <Layers size={12} className="mr-1.5 inline" />
                          All services
                        </button>
                        {services.map((svc) => (
                          <button key={svc.id} type="button"
                            onClick={() => {
                              setSelectedServiceId(svc.id);
                              setBranch(svc.branch ?? 'main');
                            }}
                            className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                              selectedServiceId === svc.id
                                ? 'border-[var(--text-primary)]/30 bg-[var(--text-primary)]/10 text-[var(--text-primary)]'
                                : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                            }`}>
                            {svc.name}
                            {selectedServiceId === svc.id && <CheckCircle2 size={12} className="ml-1.5 inline" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Branch */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Branch</label>
                    {branches.length > 0 ? (
                      <select
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-3 font-mono text-sm text-[var(--text-primary)] outline-none"
                      >
                        {branches.map((b) => (
                          <option key={b.name} value={b.name}>{b.name}{b.default ? ' (default)' : ''}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        placeholder="main"
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-3 font-mono text-sm text-[var(--text-primary)] outline-none"
                      />
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
          {showPrepare ? (
            <button type="button" onClick={() => setShowPrepare(false)}
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--hover)]">
              Close
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--hover)]">
                Cancel
              </button>
              {missing.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={submitting || loading || envIds.length === 0 || issues.length > 0}
                  className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--hover)] disabled:opacity-40"
                >
                  Deploy anyway
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting || loading || envIds.length === 0 || issues.length > 0}
                className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-40"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                {submitting ? 'Deploying…' : envIds.length > 1 ? `Deploy to ${envIds.length} envs` : 'Deploy'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
