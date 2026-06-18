'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight,
  Code2, Copy, ExternalLink, GitBranch, Globe, Image, Info, KeyRound, Loader2,
  Pencil, RefreshCw, Rocket, Save, Server, Shield, Sparkles, Box, Zap, XCircle,
  Settings2, Layers, X,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import type { UseProjectGitlabReturn } from '@/hooks/projects/use-project-gitlab';
import type { BuildStrategy, ProjectDetail, ProjectService } from '@/types/project';
import type { BuildSource } from '@/types/deployment';
import { buildService } from '@/services/build.service';
import { environmentsService } from '@/services/environments.service';
import { projectsService } from '@/services/projects.service';
import { serversService } from '@/services/servers.service';
import type { Server as ServerType } from '@/types/server';
import { getApiErrorMessage } from '@/lib/api';
import { DockerfileEditor } from '@/components/build/dockerfile-editor';
import { CicdEditor } from '@/components/build/cicd-editor';
import { BuildStatusPanel } from '../build/build-status-panel';
import { ProjectConfigsTab } from '@/components/projects/project-configs-tab';
import { ProjectEnvironmentsTab, ServiceTargetsPanel } from '@/components/projects/project-environments-tab';
import { EnvConfigsPanel } from '@/components/projects/env-configs-panel';
import type { BuildDetectResult, BuildStatusResult } from '@/services/build.service';
import type { Environment } from '@/types/environment';

type ConfigurationTabProps = {
  projectId: string;
  project?: ProjectDetail | null;
  isAdmin: boolean;
  isOwner: boolean;
  sourceType?: string | null;
  hasEnvironment?: boolean;
  gitlab: UseProjectGitlabReturn;
  scope?: 'application' | 'environments';
  onDeploy?: () => void;
  onDeployService?: (serviceId: string) => void;
  onOpenSourceSetupDialog: () => void;
};

const SCOPE_GROUP_FILTER: Record<string, string[]> = {
  application: ['Application'],
  environments: ['Environnements', 'Automatisation'],
};

function SourceSection({ gitlab, isOwner, onOpenSourceSetupDialog, services }: {
  gitlab: UseProjectGitlabReturn; isOwner: boolean; onOpenSourceSetupDialog: () => void;
  services?: ProjectService[];
}) {
  const cfg = gitlab.gitlabConfig;
  if (!cfg) return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-300">
        <AlertTriangle size={14} /> No Git source connected
      </div>
      {isOwner && (
        <Button onClick={onOpenSourceSetupDialog} icon={<ArrowRight size={13} />}>
          Connect source
        </Button>
      )}
    </div>
  );

  const activeProvider = gitlab.providers.find((p) => p.id === cfg.providerId);
  const isGroup = cfg.sourceType === 'GROUP';

  const gitlabOrigin = (() => {
    try { return cfg.gitlabUrl ? new URL(cfg.gitlabUrl).origin : null; } catch { return null; }
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10">
            <GitBranch size={16} className="text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {isGroup ? 'Groupe (multi-dépôts)' : 'Dépôt (source)'}
            </p>
            <p className="text-xs text-[var(--text-muted)]">Provider : {activeProvider?.name ?? 'Default'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {isOwner && <Button variant="secondary" onClick={onOpenSourceSetupDialog}>Edit source</Button>}
          <button type="button" onClick={() => void gitlab.loadGitlabData()} disabled={gitlab.gitlabLoading}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50">
            <RefreshCw size={12} className={gitlab.gitlabLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'URL', value: cfg.gitlabUrl, mono: true, link: cfg.gitlabUrl },
          { label: 'Type', value: cfg.sourceType, mono: true },
          { label: 'Branch', value: cfg.defaultBranch ?? 'main', mono: true },
          { label: isGroup ? 'Groupe' : 'Dépôt', value: String(isGroup ? cfg.gitlabGroupId : cfg.gitlabId) ?? '—', mono: true },
          { label: 'Registry', value: cfg.registryUrl ?? 'Not configured', mono: true },
        ].map(({ label, value, mono, link }) => (
          <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
            {link
              ? <a href={link} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center gap-1 truncate text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  <span className="truncate">{value}</span><ExternalLink size={9} />
                </a>
              : <p className={`mt-1.5 truncate text-xs font-medium text-[var(--text-primary)] ${mono ? 'font-mono' : ''}`}>{value}</p>
            }
          </div>
        ))}
      </div>

      {isGroup && services && services.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Services — {services.length}
          </p>
          <div className="space-y-2">
            {services.map((svc) => {
              const repoUrl = gitlabOrigin && svc.repositoryPath
                ? `${gitlabOrigin}/${svc.repositoryPath}`
                : null;
              return (
                <div key={svc.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3.5 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SERVICE_TYPE_COLORS[svc.type] ?? SERVICE_TYPE_COLORS.OTHER}`}>
                      {svc.type}
                    </span>
                    <span className="truncate text-sm font-medium text-[var(--text-primary)]">{svc.name}</span>
                    {svc.repositoryPath && (
                      <span className="hidden truncate font-mono text-[10px] text-[var(--text-muted)] sm:block">
                        {svc.repositoryPath}
                      </span>
                    )}
                    <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">{svc.defaultBranch}</span>
                  </div>
                  {repoUrl && (
                    <a href={repoUrl} target="_blank" rel="noreferrer"
                      className="shrink-0 flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
                      <ExternalLink size={10} /> Repo
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function WebhooksSection({ gitlab }: { gitlab: UseProjectGitlabReturn }) {
  const [copied, setCopied] = useState(false);
  const cfg = gitlab.gitlabConfig;
  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ''}/api/webhooks/gitlab`
    : '/api/webhooks/gitlab';

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* ignore */ }
  };

  const configured = cfg?.webhookSecretConfigured ?? false;
  const gitlabHooksUrl = cfg?.gitlabUrl ? `${cfg.gitlabUrl.replace(/\/$/, '')}/-/hooks` : null;

  return (
    <div className="space-y-4">
      <div className={clsx('flex items-start gap-3 rounded-xl border p-4', configured ? 'border-green-500/20 bg-green-500/8' : 'border-amber-500/20 bg-amber-500/8')}>
        {configured ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-400" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-amber-400" />}
        <div>
          <p className={`text-sm font-semibold ${configured ? 'text-green-300' : 'text-amber-300'}`}>
            {configured ? 'Webhook configured — auto-deploy active on push' : 'Webhook not configured — auto-deploy disabled'}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">Required for automatic deployments on git push.</p>
        </div>
        <Shield size={14} className={`ml-auto shrink-0 ${configured ? 'text-green-400' : 'text-[var(--text-muted)]'}`} />
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Webhook URL — add in GitLab</p>
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2.5">
          <code className="flex-1 break-all font-mono text-xs text-[var(--text-primary)]">{webhookUrl}</code>
          <button type="button" onClick={() => void handleCopy()}
            className="shrink-0 rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text-primary)]">
            {copied ? <CheckCircle2 size={12} className="text-green-400" /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {!configured && (
        <div className="space-y-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
            <Info size={12} /> How to configure in GitLab
          </p>
          <ol className="space-y-1.5 pl-1">
            {[
              'Open your GitLab repo → Settings → Webhooks',
              'Paste the URL above in the "URL" field',
              'In "Secret token", paste the secret from your Git Provider (App Settings → Git Providers)',
              'Check: Push events, Pipeline events, Merge request events',
              'Click "Add webhook" → Test → Push events',
            ].map((text, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--hover)] text-[9px] font-bold text-[var(--text-muted)]">{i + 1}</span>
                {text}
              </li>
            ))}
          </ol>
          {gitlabHooksUrl && (
            <a href={gitlabHooksUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20">
              Open GitLab → Webhooks <ExternalLink size={10} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── 7 vrais BuildSource ────────────────────────────────── */

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
    desc: 'docker build directement sur le VPS. Aucun registry.',
    icon: <Code2 size={13} />,
    badge: 'Recommandé',
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
    desc: 'Zéro Dockerfile, build sur le VPS.',
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
    label: 'Image externe',
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
  FRONTEND: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  BACKEND: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  WORKER: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  DATABASE: 'border-red-500/30 bg-red-500/10 text-red-400',
  STATIC: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
  API: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400',
  OTHER: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
};

function BuildSection({
  projectId, isAdmin, sourceType, services,
  buildStatus, buildStatusLoading, onRefreshBuildStatus,
  initialDefaultBuildSource, initialPort, initialStartCmd, initialProjType,
  onDeployService, hasEnvironment,
}: {
  projectId: string; isAdmin: boolean; sourceType?: string | null; services?: ProjectService[];
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
  const [serviceForms, setServiceForms] = useState<Record<string, { buildPack: string; dockerfilePath: string; branch: string }>>({});

  const handleSaveService = async (svcId: string, form: { buildPack: string; dockerfilePath: string; branch: string }) => {
    setSavingServiceId(svcId);
    try {
      await projectsService.updateService(projectId, svcId, {
        buildPack: form.buildPack as BuildStrategy,
        dockerfilePath: form.dockerfilePath,
        defaultBranch: form.branch,
      });
      setServiceMsgs((prev) => ({ ...prev, [svcId]: 'Saved' }));
      setTimeout(() => setServiceMsgs((prev) => ({ ...prev, [svcId]: '' })), 3000);
    } catch {
      setServiceMsgs((prev) => ({ ...prev, [svcId]: 'Error saving' }));
    } finally {
      setSavingServiceId(null);
    }
  };

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
              const form = serviceForms[svc.id] ?? { buildPack: svc.buildPack, dockerfilePath: svc.dockerfilePath, branch: svc.defaultBranch };

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
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${BUILD_PACK_COLORS[svc.buildPack] ?? BUILD_PACK_COLORS.NONE}`}>
                          {svc.buildPack}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--text-muted)]">{svc.defaultBranch}</span>
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
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Dockerfile Path</label>
                          <input type="text" value={form.dockerfilePath}
                            onChange={(e) => setServiceForms((prev) => ({ ...prev, [svc.id]: { ...form, dockerfilePath: e.target.value } }))}
                            placeholder="Dockerfile"
                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none" />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Default Branch</label>
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
                        <button type="button" onClick={() => void handleSaveService(svc.id, form)} disabled={isSaving}
                          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--hover)] disabled:opacity-40">
                          {isSaving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                          Save
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

/* ─── Domains section (self-contained) ──────────────────────────────────── */

const ENV_BADGE_CFG: Record<string, string> = {
  PRODUCTION: 'border-red-500/30 bg-red-500/10 text-red-400',
  STAGING:    'border-blue-500/30 bg-blue-500/10 text-blue-400',
  TESTING:    'border-amber-500/30 bg-amber-500/10 text-amber-400',
  PREVIEW:    'border-purple-500/30 bg-purple-500/10 text-purple-400',
};

function DomainInlineEditor({ env, projectId, onSaved }: { env: Environment; projectId: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(env.domain ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await environmentsService.update(projectId, env.id, { domain: value.trim() || undefined });
      setEditing(false);
      onSaved();
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ENV_BADGE_CFG[env.name] ?? 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400'}`}>
          {env.name}
        </span>
        {!editing && (
          <span className={`font-mono text-xs ${env.domain ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
            {env.domain || 'No domain'}
          </span>
        )}
      </div>
      {!editing ? (
        <button type="button" onClick={() => { setValue(env.domain ?? ''); setEditing(true); }}
          className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
          <Pencil size={10} /> {env.domain ? 'Edit' : 'Add domain'}
        </button>
      ) : (
        <div className="flex items-center gap-1.5">
          <input type="text" value={value} onChange={(e) => setValue(e.target.value)}
            placeholder="app.example.com" autoFocus
            className="w-48 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--text-primary)]/30" />
          <button type="button" onClick={() => void handleSave()} disabled={saving}
            className="flex items-center gap-1 rounded-lg bg-[var(--text-primary)] px-2.5 py-1.5 text-xs font-semibold text-[var(--bg-app)] disabled:opacity-50">
            {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
          </button>
          <button type="button" onClick={() => setEditing(false)}
            className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={10} />
          </button>
        </div>
      )}
    </div>
  );
}

function DomainsConfigSection({ projectId }: { projectId: string }) {
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    environmentsService.getAll(projectId).then(setEnvs).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-muted)]">
      <Loader2 size={13} className="animate-spin" /> Loading environments…
    </div>
  );

  if (envs.length === 0) return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-10 text-center">
      <Globe size={24} className="mb-2 text-[var(--text-muted)]" />
      <p className="text-sm font-semibold text-[var(--text-primary)]">No environments yet</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">Add an environment in the Environments section first.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--text-muted)]">Configure one domain per environment. Used for healthchecks and deployment URL.</p>
      <div className="space-y-2 pt-1">
        {envs.map((env) => (
          <DomainInlineEditor key={env.id} env={env} projectId={projectId} onSaved={load} />
        ))}
      </div>
    </div>
  );
}

/* ─── Per-environment variables section ─────────────────────────────────── */

function PerEnvVariablesSection({ projectId }: { projectId: string }) {
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    environmentsService.getAll(projectId)
      .then((list) => { setEnvs(list); if (list.length > 0) setSelectedEnvId(list[0].id); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-muted)]">
      <Loader2 size={13} className="animate-spin" /> Loading environments…
    </div>
  );

  if (envs.length === 0) return (
    <p className="text-sm text-[var(--text-muted)]">No environments. Add one in the Environments section first.</p>
  );

  const selectedEnv = envs.find((e) => e.id === selectedEnvId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {envs.map((env) => (
          <button key={env.id} type="button" onClick={() => setSelectedEnvId(env.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
              selectedEnvId === env.id
                ? `${ENV_BADGE_CFG[env.name] ?? 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400'}`
                : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}>
            {env.name}
          </button>
        ))}
      </div>
      {selectedEnv && (
        <div className="rounded-xl border border-[var(--border)]">
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
            <Server size={12} className="text-[var(--text-muted)]" />
            <span className="text-xs font-semibold text-[var(--text-primary)]">{selectedEnv.name}</span>
            {selectedEnv.server && <span className="font-mono text-[10px] text-[var(--text-muted)]">{selectedEnv.server.host}</span>}
          </div>
          <div className="p-4">
            <EnvConfigsPanel projectId={projectId} environmentId={selectedEnvId} onClose={() => {}} />
          </div>
        </div>
      )}
    </div>
  );
}

// Organised by the domain model: Application (the deployable = source + build),
// Environnements (where it runs + per-env config), Automatisation.
const SIDEBAR_GROUPS: {
  group: string;
  items: { id: string; label: string; icon: React.ReactNode; subtitle: string }[];
}[] = [
  {
    group: 'Application',
    items: [
      { id: 'source', label: 'Source',  icon: <GitBranch size={16} />, subtitle: 'Dépôt Git (chemin groupe/projet)' },
      { id: 'build',  label: 'Build',   icon: <Rocket size={16} />,    subtitle: 'Buildpack, port, commande' },
    ],
  },
  {
    group: 'Environnements',
    items: [
      { id: 'environments', label: 'Environnements', icon: <Layers size={16} />,   subtitle: 'Stages & serveurs (VPS)' },
      { id: 'service',      label: 'Services',       icon: <Box size={16} />,      subtitle: 'Affecter aux environnements' },
      { id: 'domains',      label: 'Domaines',       icon: <Globe size={16} />,    subtitle: 'Un domaine par environnement' },
      { id: 'variables',    label: 'Variables',      icon: <KeyRound size={16} />, subtitle: 'Globales & par environnement' },
    ],
  },
  {
    group: 'Automatisation',
    items: [
      { id: 'webhooks', label: 'Webhooks', icon: <Zap size={16} />, subtitle: 'Auto-deploy au push Git' },
    ],
  },
];

export function ConfigurationTab({
  projectId, project, isAdmin, isOwner, sourceType, hasEnvironment = true,
  gitlab, scope, onDeploy, onDeployService, onOpenSourceSetupDialog,
}: ConfigurationTabProps) {
  const filteredGroups = scope
    ? SIDEBAR_GROUPS.filter((g) => (SCOPE_GROUP_FILTER[scope] ?? []).includes(g.group))
    : SIDEBAR_GROUPS;
  const firstSection = filteredGroups.flatMap((g) => g.items.map((i) => i.id))[0] ?? 'source';
  const [activeSection, setActiveSection] = useState(firstSection);
  const [buildStatus, setBuildStatus] = useState<BuildStatusResult | null>(null);
  const [buildStatusLoading, setBuildStatusLoading] = useState(false);


  const refreshBuildStatus = () => {
    setBuildStatusLoading(true);
    buildService.getBuildStatus(projectId).then(setBuildStatus).catch(() => {}).finally(() => setBuildStatusLoading(false));
  };

  return (
    <div className="flex gap-5">
      {/* Sidebar — grouped by domain model (Application / Environnements / Automatisation) */}
      <nav className="flex w-56 shrink-0 flex-col gap-4">
        {filteredGroups.map((grp) => (
          <div key={grp.group} className="flex flex-col gap-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              {grp.group}
            </p>
            {grp.items.map((item) => (
              <button key={item.id} type="button" onClick={() => setActiveSection(item.id)}
                className={clsx(
                  'flex items-center gap-3 rounded-xl px-4 py-3 text-left transition',
                  activeSection === item.id
                    ? 'bg-[var(--text-primary)]/8 text-[var(--text-primary)] ring-1 ring-[var(--text-primary)]/15'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text-primary)]',
                )}>
                <span className="shrink-0">{item.icon}</span>
                <div>
                  <p className="text-sm font-semibold leading-tight">{item.label}</p>
                  <p className="text-[10px] text-[var(--text-muted)] leading-tight">{item.subtitle}</p>
                </div>
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {!hasEnvironment && activeSection !== 'environments' && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-amber-300">No environment configured</p>
              <p className="text-xs text-amber-400/70">Add a VPS in the Environments section below before deploying.</p>
            </div>
            <button type="button" onClick={() => setActiveSection('environments')}
              className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/30">
              Set up Environments →
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          {/* Source */}
          {activeSection === 'source' && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--hover)]">
                  <GitBranch size={16} className="text-[var(--text-secondary)]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Source</p>
                  <p className="text-xs text-[var(--text-muted)]">Git repository or group connection</p>
                </div>
              </div>
              <SourceSection gitlab={gitlab} isOwner={isOwner} onOpenSourceSetupDialog={onOpenSourceSetupDialog} services={project?.services ?? []} />
            </div>
          )}

          {/* Build */}
          {activeSection === 'build' && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--hover)]">
                  <Rocket size={16} className="text-[var(--text-secondary)]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Build</p>
                  <p className="text-xs text-[var(--text-muted)]">Build source, framework, port, start command</p>
                </div>
              </div>
              <BuildSection
                projectId={projectId} isAdmin={isAdmin} sourceType={sourceType}
                services={project?.services ?? []}
                buildStatus={buildStatus} buildStatusLoading={buildStatusLoading} onRefreshBuildStatus={refreshBuildStatus}
                initialDefaultBuildSource={project?.defaultBuildSource}
                initialPort={project?.buildPort}
                initialStartCmd={project?.buildStartCmd}
                initialProjType={project?.projectType ?? undefined}
                onDeployService={onDeployService}
                hasEnvironment={hasEnvironment}
              />
            </div>
          )}

          {/* Environments (compact — no services/domain/vars/deploy) */}
          {activeSection === 'environments' && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--hover)]">
                  <Layers size={16} className="text-[var(--text-secondary)]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Environments</p>
                  <p className="text-xs text-[var(--text-muted)]">Add VPS targets and configure servers</p>
                </div>
              </div>
              <ProjectEnvironmentsTab
                projectId={projectId}
                onChanged={() => {}}
                compact
              />
            </div>
          )}

          {/* Service assignment */}
          {activeSection === 'service' && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--hover)]">
                  <Box size={16} className="text-[var(--text-secondary)]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Service</p>
                  <p className="text-xs text-[var(--text-muted)]">Assign services to each environment VPS</p>
                </div>
              </div>
              <ServiceAssignmentSection projectId={projectId} />
            </div>
          )}

          {/* Domains */}
          {activeSection === 'domains' && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--hover)]">
                  <Globe size={16} className="text-[var(--text-secondary)]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Domains</p>
                  <p className="text-xs text-[var(--text-muted)]">One custom domain per environment</p>
                </div>
              </div>
              <DomainsConfigSection projectId={projectId} />
            </div>
          )}

          {/* Variables */}
          {activeSection === 'variables' && (
            <VariablesPanelWithTabs projectId={projectId} />
          )}

          {/* Webhooks */}
          {activeSection === 'webhooks' && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--hover)]">
                  <Zap size={16} className="text-[var(--text-secondary)]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Webhooks</p>
                  <p className="text-xs text-[var(--text-muted)]">Auto-deploy on git push</p>
                </div>
              </div>
              <WebhooksSection gitlab={gitlab} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/* ─── Variables panel with Global / Per-environment tabs ────────────────── */

function VariablesPanelWithTabs({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<'global' | 'perenv'>('global');

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--hover)]">
          <KeyRound size={16} className="text-[var(--text-secondary)]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Variables</p>
          <p className="text-xs text-[var(--text-muted)]">Global env vars and per-environment overrides</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="mb-4 flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-1">
        <button type="button" onClick={() => setTab('global')}
          className={clsx('flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
            tab === 'global'
              ? 'bg-[var(--text-primary)] text-[var(--bg-app)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          )}>
          Global (all environments)
        </button>
        <button type="button" onClick={() => setTab('perenv')}
          className={clsx('flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
            tab === 'perenv'
              ? 'bg-[var(--text-primary)] text-[var(--bg-app)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          )}>
          Per environment
        </button>
      </div>

      {tab === 'global' && (
        <div>
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/8 px-3 py-2 text-xs text-blue-300">
            <Info size={12} className="shrink-0" />
            Values are encrypted and injected into every deployment across all environments.
          </div>
          <ProjectConfigsTab projectId={projectId} />
        </div>
      )}

      {tab === 'perenv' && (
        <div>
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/8 px-3 py-2 text-xs text-purple-300">
            <Info size={12} className="shrink-0" />
            Per-environment variables override global ones when deploying to that specific environment.
          </div>
          <PerEnvVariablesSection projectId={projectId} />
        </div>
      )}
    </div>
  );
}

/* ─── Service assignment section (self-contained) ───────────────────────── */

function ServiceAssignmentSection({ projectId }: { projectId: string }) {
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [services, setServices] = useState<ProjectService[]>([]);
  const [servers, setServers] = useState<ServerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEnvId, setExpandedEnvId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      environmentsService.getAll(projectId),
      projectsService.getServices(projectId).catch(() => [] as ProjectService[]),
      serversService.getAll().catch(() => [] as ServerType[]),
    ])
      .then(([e, s, srv]) => {
        setEnvs(e);
        setServices(s);
        setServers(srv.filter((r) => r.isVerified));
        if (e.length > 0 && !expandedEnvId) setExpandedEnvId(e[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-muted)]">
      <Loader2 size={13} className="animate-spin" /> Loading…
    </div>
  );

  if (envs.length === 0) return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-10 text-center">
      <Box size={24} className="mb-2 text-[var(--text-muted)]" />
      <p className="text-sm font-semibold text-[var(--text-primary)]">No environments yet</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">Add environments first in the Environments section.</p>
    </div>
  );

  if (services.length === 0) return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-10 text-center">
      <Box size={24} className="mb-2 text-[var(--text-muted)]" />
      <p className="text-sm font-semibold text-[var(--text-primary)]">No services configured</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">This is a single-service (REPO) project. Service assignment only applies to GROUP projects.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--text-muted)]">For each environment, assign services to a VPS and configure port and healthcheck.</p>
      <div className="space-y-2 pt-1">
        {envs.map((env) => {
          const open = expandedEnvId === env.id;
          return (
            <div key={env.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)]">
              <button type="button" onClick={() => setExpandedEnvId(open ? null : env.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ENV_BADGE_CFG[env.name] ?? 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400'}`}>
                    {env.name}
                  </span>
                  {env.server && <span className="font-mono text-xs text-[var(--text-muted)]">{env.server.host}</span>}
                </div>
                {open ? <ChevronDown size={13} className="text-[var(--text-muted)]" /> : <ChevronRight size={13} className="text-[var(--text-muted)]" />}
              </button>
              {open && (
                <div className="border-t border-[var(--border)] px-4 pb-4">
                  <ServiceTargetsPanel
                    projectId={projectId}
                    envId={env.id}
                    services={services}
                    servers={servers}
                    existingTargets={env.serviceTargets ?? []}
                    onSaved={load}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
