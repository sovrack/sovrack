'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Code2, Layers, Loader2, RefreshCw,
  Rocket, Save, Settings2, Box, Globe, Image, Sparkles,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import { buildService } from '@/services/build.service';
import { getApiErrorMessage } from '@/lib/api';
import { DockerfileEditor } from '@/components/build/dockerfile-editor';
import { CicdEditor } from '@/components/build/cicd-editor';
import { BuildStatusPanel } from '../build/build-status-panel';
import type { BuildDetectResult, BuildStatusResult } from '@/services/build.service';
import type { BuildSource } from '@/types/deployment';
import type { Service } from '@/types/service';

type BuildSourceOption = {
  value: BuildSource;
  label: string;
  desc: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
  needsImage?: boolean;
};

const BUILD_SOURCE_OPTIONS: BuildSourceOption[] = [
  {
    value: 'DOCKERFILE_LOCAL',
    label: 'Dockerfile — Local',
    desc: 'docker build directement sur le VPS. No registry.',
    icon: <Code2 size={13} />,
    badge: 'Recommended',
    badgeColor: 'text-green-300',
  },
  {
    value: 'DOCKERFILE_REGISTRY',
    label: 'Dockerfile — Registry',
    desc: 'Build CI → registry → pull sur le VPS.',
    icon: <Code2 size={13} />,
    badge: 'CI',
    badgeColor: 'text-blue-300',
  },
  {
    value: 'NIXPACKS_LOCAL',
    label: 'Nixpacks — Local',
    desc: 'Zero Dockerfile, builds on the VPS.',
    icon: <Sparkles size={13} />,
    badge: 'Auto-detect',
    badgeColor: 'text-purple-300',
  },
  {
    value: 'NIXPACKS_REGISTRY',
    label: 'Nixpacks — Registry',
    desc: 'Build CI Nixpacks → registry → pull VPS.',
    icon: <Sparkles size={13} />,
    badge: 'CI',
    badgeColor: 'text-blue-300',
  },
  {
    value: 'DOCKER_COMPOSE',
    label: 'Docker Compose',
    desc: 'Multi-service orchestration.',
    icon: <Box size={13} />,
  },
  {
    value: 'STATIC',
    label: 'Site statique',
    desc: 'HTML/CSS/JS servi par Nginx.',
    icon: <Globe size={13} />,
  },
  {
    value: 'EXTERNAL_IMAGE',
    label: 'External image',
    desc: 'Pull une image existante, pas de build.',
    icon: <Image size={13} />,
    needsImage: true,
  },
];

const BUILD_PACK_COLORS: Record<string, string> = {
  DOCKERFILE: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  DOCKER_COMPOSE: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
  NIXPACKS: 'border-green-500/30 bg-green-500/10 text-green-400',
  BUILDPACK: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  STATIC: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  NONE: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
};

const SERVICE_TYPE_COLORS: Record<string, string> = {
  APPLICATION: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  DATABASE: 'border-red-500/30 bg-red-500/10 text-red-400',
  COMPOSE: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
  OTHER: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
};

export function BuildSection({
  projectId, isAdmin, sourceType, services,
  buildStatus, buildStatusLoading, onRefreshBuildStatus,
  initialDefaultBuildSource, initialPort, initialStartCmd, initialProjType,
  onDeployService, hasEnvironment,
}: {
  projectId: string; isAdmin: boolean; sourceType?: string | null; services?: Service[];
  buildStatus: BuildStatusResult | null; buildStatusLoading: boolean; onRefreshBuildStatus: () => void;
  initialDefaultBuildSource?: string | null; initialPort?: number | null; initialStartCmd?: string | null; initialProjType?: string | null;
  onDeployService?: (serviceId: string) => void; hasEnvironment?: boolean;
}) {
  const isGroup = sourceType === 'GROUP';
  const defaultOption = BUILD_SOURCE_OPTIONS.find((o) => o.value === initialDefaultBuildSource) ?? BUILD_SOURCE_OPTIONS[0];
  const [buildSource, setBuildSource] = useState<BuildSource>(defaultOption.value);
  const [overrideImage, setOverrideImage] = useState('');
  const [port, setPort] = useState(String(initialPort ?? 3000));
  const [startCmd, setStartCmd] = useState(initialStartCmd ?? 'node dist/main.js');
  const [projType, setProjType] = useState(initialProjType ?? 'nodejs');
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [detected, setDetected] = useState<BuildDetectResult | null>(null);
  const [dockerfileContent, setDockerfileContent] = useState('');
  const [gitlabCiContent, setGitlabCiContent] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const [savingServiceId, setSavingServiceId] = useState<string | null>(null);
  const [serviceMsgs, setServiceMsgs] = useState<Record<string, string>>({});
  const [serviceForms, setServiceForms] = useState<Record<string, { buildPack: string; dockerfile: string; branch: string }>>({});

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  const selectedOption = BUILD_SOURCE_OPTIONS.find((o) => o.value === buildSource) ?? BUILD_SOURCE_OPTIONS[0];
  const isDockerfile = buildSource === 'DOCKERFILE_LOCAL' || buildSource === 'DOCKERFILE_REGISTRY';
  const isNixpacks = buildSource === 'NIXPACKS_LOCAL' || buildSource === 'NIXPACKS_REGISTRY';

  const handleDetect = async () => {
    setDetecting(true); setMsg(null);
    try {
      const r = await buildService.detect(projectId, undefined);
      setDetected(r);
      const recommended: BuildSource =
        r.recommendedStrategy === 'nixpacks' ? 'NIXPACKS_LOCAL'
        : r.hasDockerCompose && !r.hasDockerfile ? 'DOCKER_COMPOSE'
        : 'DOCKERFILE_LOCAL';
      setBuildSource(recommended);
      setProjType(r.recommendedBuildType || r.type || projType);
      setPort(String(r.recommendedPort || port));
      setStartCmd(r.recommendedStartCommand || startCmd);
    } catch (err) { setMsg({ type: 'err', text: getApiErrorMessage(err) }); }
    finally { setDetecting(false); }
  };

  const handleSave = async () => {
    setSaving(true); setMsg(null);
    try {
      await buildService.updateConfig(projectId, {
        defaultBuildSource: buildSource,
        projectType: projType,
        buildPort: parseInt(port, 10) || 3000,
        buildStartCmd: startCmd,
      });
      setMsg({ type: 'ok', text: 'Configuration saved.' });
    } catch (err) { setMsg({ type: 'err', text: getApiErrorMessage(err) }); }
    finally { setSaving(false); }
  };

  const handleGenerate = async () => {
    setPreparing(true); setMsg(null);
    try {
      await buildService.updateConfig(projectId, { projectType: projType, buildPort: parseInt(port, 10) || 3000, buildStartCmd: startCmd });
      const r = await buildService.prepare(projectId, undefined, {});
      setDockerfileContent(r.dockerfileContent);
      setGitlabCiContent(r.gitlabCiContent);
      onRefreshBuildStatus();
      setMsg({ type: 'ok', text: 'Files generated.' });
    } catch (err) { setMsg({ type: 'err', text: getApiErrorMessage(err) }); }
    finally { setPreparing(false); }
  };

  const handlePush = async () => {
    setPushing(true); setMsg(null);
    try {
      await buildService.updateConfig(projectId, { dockerfileContent, gitlabCiContent });
      await buildService.pushFiles(projectId, undefined);
      onRefreshBuildStatus();
      setMsg({ type: 'ok', text: 'Files pushed to GitLab — pipeline triggered.' });
    } catch (err) { setMsg({ type: 'err', text: getApiErrorMessage(err) }); }
    finally { setPushing(false); }
  };

  const isLocalBuild = buildSource === 'DOCKERFILE_LOCAL' || buildSource === 'NIXPACKS_LOCAL';
  const isRegistryBuild = buildSource === 'DOCKERFILE_REGISTRY' || buildSource === 'NIXPACKS_REGISTRY';

  if (isGroup) {
    const svcs = services ?? [];
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Layers size={14} />
          <span>{svcs.length} service{svcs.length !== 1 ? 's' : ''} — configure and deploy each individually</span>
        </div>

        {svcs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
            No services configured for this group. Add them in the source setup.
          </div>
        ) : (
          <div className="space-y-3">
            {svcs.map((svc) => {
              const isOpen = configuringId === svc.id;
              const isSaving = savingServiceId === svc.id;
              const form = serviceForms[svc.id] ?? { buildPack: svc.buildPack ?? 'DOCKERFILE', dockerfile: svc.dockerfile ?? 'Dockerfile', branch: svc.branch ?? 'main' };

              return (
                <div key={svc.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
                  {/* Header row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">{svc.name}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SERVICE_TYPE_COLORS[svc.type] ?? SERVICE_TYPE_COLORS.OTHER}`}>
                          {svc.type}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${BUILD_PACK_COLORS[svc.buildPack ?? 'NONE'] ?? BUILD_PACK_COLORS.NONE}`}>
                          {svc.buildPack}
                        </span>
                        {svc.branch && <span className="font-mono text-[10px] text-[var(--text-muted)]">{svc.branch}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button type="button" onClick={() => setConfiguringId(isOpen ? null : svc.id)}
                        className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--hover)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                        <Settings2 size={11} />
                        {isOpen ? 'Hide' : 'Configure'}
                      </button>
                      {onDeployService && (
                        <button type="button" onClick={() => onDeployService(svc.id)}
                          className="flex items-center gap-1 rounded-lg bg-[var(--text-primary)] px-2.5 py-1.5 text-xs font-semibold text-[var(--bg-app)] hover:opacity-90">
                          <Rocket size={11} /> Deploy
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded config panel */}
                  {isOpen && (
                    <div className="border-t border-[var(--border)] px-4 py-4 space-y-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Build Pack</label>
                          <select value={form.buildPack}
                            onChange={(e) => setServiceForms((prev) => ({ ...prev, [svc.id]: { ...form, buildPack: e.target.value } }))}
                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none">
                            {['DOCKERFILE', 'NIXPACKS', 'BUILDPACK', 'DOCKER_COMPOSE', 'STATIC', 'NONE'].map((bp) => (
                              <option key={bp} value={bp}>{bp}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Dockerfile</label>
                          <input type="text" value={form.dockerfile}
                            onChange={(e) => setServiceForms((prev) => ({ ...prev, [svc.id]: { ...form, dockerfile: e.target.value } }))}
                            placeholder="Dockerfile content or path"
                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none" />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Branch</label>
                          <input type="text" value={form.branch}
                            onChange={(e) => setServiceForms((prev) => ({ ...prev, [svc.id]: { ...form, branch: e.target.value } }))}
                            placeholder="main"
                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none" />
                        </div>
                      </div>

                      {serviceMsgs[svc.id] && (
                        <div className="flex items-center gap-1.5 text-xs text-green-400">
                          <CheckCircle2 size={11} /> {serviceMsgs[svc.id]}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button type="button"
                          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--hover)] disabled:opacity-40" disabled>
                          <Save size={11} />
                          Save (per-environment)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Build source selector — 7 vrais modes */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Build source
          <span className="ml-2 text-[var(--text-secondary)] font-normal normal-case">
            — comment l&apos;image est construite
          </span>
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BUILD_SOURCE_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" disabled={!isAdmin} onClick={() => setBuildSource(opt.value)}
              className={clsx('flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition disabled:opacity-60',
                buildSource === opt.value
                  ? 'border-[var(--text-primary)]/40 bg-[var(--text-primary)]/8 ring-1 ring-[var(--text-primary)]/20'
                  : 'border-[var(--border)] hover:border-[var(--text-primary)]/20 hover:bg-[var(--hover)]')}>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs ${buildSource === opt.value ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                  {opt.icon}
                </span>
                <span className={`text-xs font-semibold ${buildSource === opt.value ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                  {opt.label}
                </span>
              </div>
              {opt.badge && <span className={`text-[9px] font-bold ${opt.badgeColor}`}>{opt.badge}</span>}
              <p className="text-[9px] text-[var(--text-muted)] leading-relaxed">{opt.desc}</p>
              {buildSource === opt.value && <CheckCircle2 size={10} className="text-[var(--text-primary)]" />}
            </button>
          ))}
        </div>
        {selectedOption.needsImage && (
          <div className="mt-3">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Image Docker <span className="text-red-400">*</span>
            </label>
            <input type="text" value={overrideImage} onChange={(e) => setOverrideImage(e.target.value)}
              placeholder="docker.io/nginx:latest"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none" />
          </div>
        )}
      </div>

      {/* Fields */}
      <div className="grid gap-3 sm:grid-cols-3">
        {isDockerfile && (
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Framework</label>
            <select value={projType} onChange={(e) => setProjType(e.target.value)} disabled={!isAdmin}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none disabled:opacity-60">
              {[
                { value: 'nestjs', label: 'NestJS' }, { value: 'nextjs', label: 'Next.js' },
                { value: 'react', label: 'React SPA' }, { value: 'nodejs', label: 'Node.js' },
                { value: 'python', label: 'Python' }, { value: 'go', label: 'Go' },
                { value: 'static', label: 'Static site' }, { value: 'dockerized', label: 'Existing Dockerfile' },
              ].map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        )}
        {buildSource !== 'STATIC' && (
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Port</label>
            <input type="number" value={port} onChange={(e) => setPort(e.target.value)} disabled={!isAdmin}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none disabled:opacity-60" />
          </div>
        )}
        {buildSource !== 'STATIC' && buildSource !== 'DOCKER_COMPOSE' && buildSource !== 'EXTERNAL_IMAGE' && (
          <div className={!isDockerfile ? 'sm:col-span-2' : ''}>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Start command {isNixpacks ? '(optional)' : ''}
            </label>
            <input type="text" value={startCmd} onChange={(e) => setStartCmd(e.target.value)} disabled={!isAdmin}
              placeholder={isNixpacks ? 'auto-detected' : 'node dist/main.js'}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none disabled:opacity-60" />
          </div>
        )}
      </div>

      {detected && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/8 px-3 py-2 text-xs text-blue-300">
          <CheckCircle2 size={12} /> Auto-detected: {detected.type} · {detected.language} · confidence {detected.confidence}
        </div>
      )}

      {msg && (
        <div className={clsx('rounded-lg px-3 py-2 text-xs', msg.type === 'ok' ? 'border border-green-500/20 bg-green-500/8 text-green-400' : 'border border-red-500/20 bg-red-500/8 text-red-400')}>
          {msg.text}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
        <button type="button" onClick={() => void handleDetect()} disabled={detecting || !isAdmin}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50">
          {detecting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Auto-detect
        </button>
        {isLocalBuild && isAdmin && (
          <Button onClick={() => void handleGenerate()} loading={preparing} icon={<Rocket size={12} />}>
            Generate Dockerfile
          </Button>
        )}
        {isRegistryBuild && isAdmin && (
          <Button onClick={() => void handleGenerate()} loading={preparing} icon={<Rocket size={12} />}>
            Generate .gitlab-ci.yml
          </Button>
        )}
        {gitlabCiContent && isRegistryBuild && isAdmin && (
          <Button variant="secondary" onClick={() => void handlePush()} loading={pushing}>
            Push to GitLab
          </Button>
        )}
      </div>

      {/* LOCAL: show Dockerfile editor only */}
      {dockerfileContent && isLocalBuild && (
        <div className="rounded-xl border border-[var(--border)] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Code2 size={14} className="text-[var(--text-secondary)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">Dockerfile</p>
            <span className="text-[10px] text-[var(--text-muted)]">— local build on VPS</span>
          </div>
          <DockerfileEditor value={dockerfileContent} onChange={setDockerfileContent} readonly={!isAdmin} />
        </div>
      )}

      {/* REGISTRY: show CI editor only */}
      {gitlabCiContent && isRegistryBuild && (
        <div className="rounded-xl border border-[var(--border)] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Code2 size={14} className="text-[var(--text-secondary)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">.gitlab-ci.yml</p>
            <span className="text-[10px] text-[var(--text-muted)]">— CI build then push to registry</span>
          </div>
          <CicdEditor value={gitlabCiContent} onChange={setGitlabCiContent} readonly={!isAdmin} />
        </div>
      )}

      <BuildStatusPanel buildStatus={buildStatus} buildStatusLoading={buildStatusLoading} onRefresh={onRefreshBuildStatus} />

      <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          {hasEnvironment
            ? <><CheckCircle2 size={12} className="text-green-400" /> Environment ready</>
            : <><AlertTriangle size={12} className="text-amber-400" /> No environment</>}
        </div>
        {isAdmin && (
          <Button onClick={() => void handleSave()} loading={saving}>
            <Save size={13} className="mr-1.5" /> Save configuration
          </Button>
        )}
      </div>
    </div>
  );
}
