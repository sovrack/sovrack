'use client';

import { useEffect, useMemo, useState } from 'react';
import { EnvVariablesPreview } from './env-variables-preview';
import {
  AlertTriangle,
  CheckCircle2,
  Layers,
  Loader2,
  Rocket,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { deploymentsService } from '@/services/deployments.service';
import { environmentsService } from '@/services/environments.service';
import { projectsService } from '@/services/projects.service';
import { getApiErrorMessage } from '@/lib/api';
import type { Environment } from '@/types/environment';
import type { GitlabBranch } from '@/types/project';
import type { Service } from '@/types/service';
import type { BuildSource, DeployValidationResult } from '@/types/deployment';

type ValidationIssue = {
  type: 'no-source' | 'no-build-config' | 'no-environment' | 'no-branch';
  message: string;
  /** Lien direct vers l'endroit où corriger le problème (page service ou onglet env). */
  href: string;
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
};

/** Map a service's buildPack to the BuildSource the backend expects. */
function resolveBuildSource(svc: Service | undefined): BuildSource {
  if (!svc) return 'DOCKERFILE_LOCAL';
  if (svc.sourceType === 'DOCKER_IMAGE') return 'EXTERNAL_IMAGE';
  if (svc.type === 'DATABASE') return 'EXTERNAL_IMAGE';
  switch (svc.buildPack) {
    case 'NIXPACKS':       return 'NIXPACKS_LOCAL';
    case 'STATIC':         return 'STATIC';
    case 'DOCKER_COMPOSE': return 'DOCKER_COMPOSE';
    default:               return 'DOCKERFILE_LOCAL';
  }
}

export function DeployDialog({ projectId, open, onClose, onCreated, services = [], initialServiceId, initialEnvironmentId, initialBranch }: Props) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [branches, setBranches] = useState<GitlabBranch[]>([]);
  const [envIds, setEnvIds] = useState<string[]>([]);
  const [branch, setBranch] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState(initialServiceId ?? '');

  const selectedService = services.find((s) => s.id === selectedServiceId);
  const effectiveBuildSource: BuildSource = resolveBuildSource(selectedService);

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

  const primaryEnvId = envIds[0] ?? '';
  const currentEnv = environments.find((e) => e.id === primaryEnvId);

  // Resolve the ServiceEnvironment to preview: the selected service's link in
  // the primary environment (or the first link when no specific service chosen).
  const previewServiceEnvId = useMemo<string | null>(() => {
    const links = currentEnv?.serviceLinks ?? [];
    if (links.length === 0) return null;
    if (selectedServiceId) {
      return links.find((l) => l.serviceId === selectedServiceId)?.id ?? null;
    }
    return links[0]?.id ?? null;
  }, [currentEnv, selectedServiceId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError(null); setSuccess(false); setIssues([]);
    setValidation(null); setValidateError(null);
    if (initialServiceId) setSelectedServiceId(initialServiceId);

    // Pre-fill branch : initialBranch explicite (ex: redeploy) > defaut du service
    if (initialBranch) {
      setBranch(initialBranch);
    } else if (initialServiceId && services.length > 0) {
      const svc = services.find((s) => s.id === initialServiceId);
      if (svc?.branch) setBranch(svc.branch);
    }

    // Resolve build readiness from the selected service directly — no longer
    // gated on a project-level gitlabConfig. A service is "ready" when:
    //   - GIT: has repoPath (or repoUrl) + buildPack
    //   - DOCKER_IMAGE / DATABASE: always ready (image is pulled, no build)
    const checkBuildReady = (svc: Service | undefined): { hasSource: boolean; hasBuildConfig: boolean } => {
      if (!svc) return { hasSource: false, hasBuildConfig: false };
      if (svc.type === 'DATABASE' || svc.sourceType === 'DOCKER_IMAGE') {
        return { hasSource: true, hasBuildConfig: true };
      }
      const src = !!(svc.repoPath || svc.repoUrl);
      const build = !!(svc.buildPack);
      return { hasSource: src, hasBuildConfig: src && build };
    };

    Promise.all([
      environmentsService.getAll(projectId),
      projectsService.getBranches(projectId).catch(() => [] as GitlabBranch[]),
    ])
      .then(([envs, brs]) => {
        if (cancelled) return;
        setEnvironments(envs);
        setBranches(brs);

        const svc = services.find((s) => s.id === initialServiceId) ?? services[0];
        const { hasSource: src, hasBuildConfig: buildReady } = checkBuildReady(svc);

        if (initialEnvironmentId && envs.some((e) => e.id === initialEnvironmentId)) {
          setEnvIds([initialEnvironmentId]);
        } else {
          setEnvIds(envs.length > 0 ? [envs[0].id] : []);
        }
        const def = brs.find((b) => b.default);
        setBranch(initialBranch ?? def?.name ?? brs[0]?.name ?? 'main');

        // Le source ET le build pack se configurent dans la page du service
        // (onglet General → ServiceConfigForm), PAS dans la liste des services.
        const svcConfigHref = svc ? `/projects/${projectId}/services/${svc.id}` : `/projects/${projectId}`;
        const detected: ValidationIssue[] = [];
        if (services.length > 0 && !src) detected.push({ type: 'no-source', message: `${svc?.name ?? 'Service'} : aucune source Git configurée.`, href: svcConfigHref });
        if (services.length > 0 && !buildReady) detected.push({ type: 'no-build-config', message: `${svc?.name ?? 'Service'} : build pack non configuré.`, href: svcConfigHref });
        if (envs.length === 0) detected.push({ type: 'no-environment', message: 'Aucun environnement configuré.', href: `/projects/${projectId}?tab=environments` });
        setIssues(detected);
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [open, loading, primaryEnvId, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

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
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Deploy</h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Launch a new deployment</p>
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

          {/* ════════ DEPLOY FORM ════════ */}
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
                        href={issue.href}
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

              {!loading && (
                <p className="rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-2.5 text-[11px] text-[var(--text-muted)]">
                  Chaque service se construit avec son propre build — modifiez-le dans l&apos;onglet <strong>General</strong> du service.
                </p>
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

          {previewServiceEnvId ? (
            <EnvVariablesPreview serviceEnvId={previewServiceEnvId} />
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
          <>
              <button type="button" onClick={onClose}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--hover)]">
                Cancel
              </button>
              {missing.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={!canDeploy}
                  className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--hover)] disabled:opacity-40"
                >
                  Deploy anyway
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!canDeploy}
                className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-40"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                {submitting ? 'Deploying…' : envIds.length > 1 ? `Deploy to ${envIds.length} envs` : 'Deploy'}
              </button>
          </>
        </div>
      </div>
    </div>
  );
}
