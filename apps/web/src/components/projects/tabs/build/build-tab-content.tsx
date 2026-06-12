'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  ExternalLink,
  Globe,
  Layers,
  Loader2,
  RefreshCw,
  Rocket,
  Sparkles,
  XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import { buildService, type BuildDetectResult, type BuildStatusResult, type BuildAllResult } from '@/services/build.service';
import { projectsService } from '@/services/projects.service';
import type { Service } from '@/types/service';
import { getApiErrorMessage } from '@/lib/api';
import { BuildFilesPreview } from './build-files-preview';
import { BuildStatusPanel } from './build-status-panel';

export type ProjectBuildTabContentProps = {
  projectId: string;
  isAdmin: boolean;
  sourceType?: string | null;
  hasEnvironment?: boolean;
  onGoToEnvironments?: () => void;
  onDeploy?: () => void;
};

/* ─── Engine options ─────────────────────────────────────────────────────── */

type EngineOption = {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
};

const ENGINES: EngineOption[] = [
  { id: 'DOCKERFILE',     label: 'Dockerfile',     icon: <Code2 size={14} />,    badge: 'Recommandé', badgeColor: 'text-green-300' },
  { id: 'NIXPACKS',       label: 'Nixpacks',       icon: <Sparkles size={14} />, badge: 'Auto-detect', badgeColor: 'text-purple-300' },
  { id: 'BUILDPACK',      label: 'Buildpack',      icon: <Layers size={14} /> },
  { id: 'DOCKER_COMPOSE', label: 'Docker Compose', icon: <Box size={14} /> },
  { id: 'STATIC',         label: 'Site statique',  icon: <Globe size={14} /> },
];

const PROJECT_TYPES: { value: string; label: string }[] = [
  { value: 'nestjs',        label: 'NestJS API' },
  { value: 'nextjs',        label: 'Next.js App' },
  { value: 'react',         label: 'React SPA' },
  { value: 'nodejs',        label: 'Node.js' },
  { value: 'python',        label: 'Python' },
  { value: 'django',        label: 'Django' },
  { value: 'go',            label: 'Go Service' },
  { value: 'java',          label: 'Java' },
  { value: 'spring-boot',   label: 'Spring Boot' },
  { value: 'php',           label: 'PHP' },
  { value: 'laravel',       label: 'Laravel' },
  { value: 'ruby',          label: 'Ruby' },
  { value: 'rust',          label: 'Rust' },
  { value: 'static',        label: 'Site statique' },
  { value: 'dockerized',    label: 'Dockerfile existant' },
  { value: 'compose',       label: 'Docker Compose' },
];

type ServiceLocalConfig = {
  engine: string;
  port: string;
  startCmd: string;
  type: string;
};

/* ─── Inline service config panel ─────────────────────────────────────────── */

function ServiceConfigPanel({
  service,
  isAdmin,
  projectId,
  initialConfig,
  onClose,
  onGenerated,
}: {
  service: Service;
  isAdmin: boolean;
  projectId: string;
  initialConfig: ServiceLocalConfig;
  onClose: () => void;
  onGenerated: (dockerfileContent: string, gitlabCiContent: string) => void;
}) {
  const [config, setConfig] = useState<ServiceLocalConfig>(initialConfig);
  const [preparing, setPreparing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<BuildDetectResult | null>(null);
  const [dockerfileContent, setDockerfileContent] = useState('');
  const [gitlabCiContent, setGitlabCiContent] = useState('');
  const [savingFiles, setSavingFiles] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showEngine = config.engine !== 'DOCKER_COMPOSE';
  const showStartCmd = config.engine !== 'STATIC' && config.engine !== 'DOCKER_COMPOSE';
  const showType = config.engine === 'DOCKERFILE' || config.engine === 'BUILDPACK';

  const handleDetect = async () => {
    setDetecting(true); setMsg(null);
    try {
      const r = await buildService.detect(projectId, service.id);
      setDetected(r);
      setConfig((prev) => ({
        ...prev,
        type: r.recommendedBuildType || r.type || prev.type,
        port: String(r.recommendedPort || prev.port),
        startCmd: r.recommendedStartCommand || prev.startCmd,
        engine: r.recommendedStrategy === 'nixpacks' ? 'NIXPACKS'
          : r.recommendedStrategy === 'static-build' ? 'STATIC'
          : r.hasDockerCompose && !r.hasDockerfile ? 'DOCKER_COMPOSE'
          : 'DOCKERFILE',
      }));
      setMsg({ type: 'success', text: `Détecté : ${r.type} (${r.language})` });
    } catch (err) {
      setMsg({ type: 'error', text: getApiErrorMessage(err) });
    } finally {
      setDetecting(false);
    }
  };

  const handleGenerate = async () => {
    setPreparing(true); setMsg(null);
    try {
      await buildService.updateConfig(projectId, {
        projectType: config.type,
        buildPort: parseInt(config.port, 10) || 3000,
        buildStartCmd: config.startCmd,
      });
      const result = await buildService.prepare(projectId, service.id, {});
      setDockerfileContent(result.dockerfileContent);
      setGitlabCiContent(result.gitlabCiContent);
      onGenerated(result.dockerfileContent, result.gitlabCiContent);
      setMsg({ type: 'success', text: 'Fichiers générés avec succès.' });
    } catch (err) {
      setMsg({ type: 'error', text: getApiErrorMessage(err) });
    } finally {
      setPreparing(false);
    }
  };

  const handlePush = async () => {
    setPushing(true); setMsg(null);
    try {
      await buildService.updateConfig(projectId, { dockerfileContent, gitlabCiContent });
      await buildService.pushFiles(projectId, service.id);
      setMsg({ type: 'success', text: 'Fichiers poussés dans GitLab.' });
    } catch (err) {
      setMsg({ type: 'error', text: getApiErrorMessage(err) });
    } finally {
      setPushing(false);
    }
  };

  const handleSaveFiles = async () => {
    setSavingFiles(true);
    try {
      await buildService.updateConfig(projectId, { dockerfileContent, gitlabCiContent });
      setMsg({ type: 'success', text: 'Fichiers sauvegardés.' });
    } catch (err) {
      setMsg({ type: 'error', text: getApiErrorMessage(err) });
    } finally {
      setSavingFiles(false);
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-[var(--text-primary)]/15 bg-[var(--bg-app)] p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-[var(--text-primary)]">Configuration — {service.name}</p>
        <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><XCircle size={14} /></button>
      </div>

      {/* Engine selector */}
      <div className="mb-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Moteur</p>
        <div className="flex flex-wrap gap-1.5">
          {ENGINES.map((eng) => (
            <button
              key={eng.id}
              type="button"
              disabled={!isAdmin}
              onClick={() => setConfig((prev) => ({ ...prev, engine: eng.id }))}
              className={clsx(
                'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-60',
                config.engine === eng.id
                  ? 'border-[var(--text-primary)]/30 bg-[var(--text-primary)]/10 text-[var(--text-primary)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]',
              )}
            >
              {eng.icon} {eng.label}
              {eng.badge && <span className={clsx('text-[9px] font-bold', eng.badgeColor)}>{eng.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Fields grid */}
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        {showType && (
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Type</label>
            <select
              value={config.type}
              onChange={(e) => setConfig((p) => ({ ...p, type: e.target.value }))}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none disabled:opacity-60"
            >
              {PROJECT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        )}
        {showEngine && (
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Port</label>
            <input
              type="number"
              value={config.port}
              onChange={(e) => setConfig((p) => ({ ...p, port: e.target.value }))}
              disabled={!isAdmin}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none disabled:opacity-60"
            />
          </div>
        )}
        {showStartCmd && (
          <div className={!showType ? 'sm:col-span-2' : ''}>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Commande {config.engine === 'NIXPACKS' ? '(optionnel)' : ''}
            </label>
            <input
              type="text"
              value={config.startCmd}
              onChange={(e) => setConfig((p) => ({ ...p, startCmd: e.target.value }))}
              disabled={!isAdmin}
              placeholder={config.engine === 'NIXPACKS' ? 'auto-détecté' : 'node dist/main.js'}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none disabled:opacity-60"
            />
          </div>
        )}
      </div>

      {/* Detect + detected info */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => void handleDetect()} loading={detecting} disabled={!isAdmin}>
          <span className="text-xs">{detecting ? 'Détection…' : 'Détecter automatiquement'}</span>
        </Button>
        {detected && (
          <span className="text-xs text-[var(--text-muted)]">
            {detected.type} · {detected.language} · confiance {detected.confidence}
          </span>
        )}
      </div>

      {msg && (
        <div className={clsx('mb-3 rounded-lg px-3 py-2 text-xs', msg.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400')}>
          {msg.text}
        </div>
      )}

      {/* Generate button */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void handleGenerate()} loading={preparing} disabled={!isAdmin} icon={preparing ? undefined : <Rocket size={12} />}>
          <span className="text-xs">Générer les fichiers</span>
        </Button>
        {dockerfileContent && (
          <>
            <Button variant="secondary" onClick={() => void handlePush()} loading={pushing} disabled={!isAdmin}>
              <span className="text-xs">Pousser dans GitLab</span>
            </Button>
          </>
        )}
      </div>

      {/* Files preview */}
      {dockerfileContent && (
        <BuildFilesPreview
          isAdmin={isAdmin}
          isVisible
          isGroupSource
          selectedServiceReady
          dockerfileContent={dockerfileContent}
          gitlabCiContent={gitlabCiContent}
          preparing={preparing}
          pushing={pushing}
          savingFiles={savingFiles}
          onDockerfileChange={setDockerfileContent}
          onGitlabCiChange={setGitlabCiContent}
          onSaveFiles={() => void handleSaveFiles()}
          onPrepare={() => void handleGenerate()}
          onPush={() => void handlePush()}
        />
      )}
    </div>
  );
}

/* ─── RepoBuildConfig — REPO source interactive config ──────────────────── */

type RepoBuildConfigProps = {
  projectId: string;
  isAdmin: boolean;
  prepareAllResults: BuildAllResult[] | null;
  onGenerated: () => void;
};

function RepoBuildConfig({ projectId, isAdmin, prepareAllResults, onGenerated }: RepoBuildConfigProps) {
  const [engine,    setEngine]    = useState('DOCKERFILE');
  const [port,      setPort]      = useState('3000');
  const [startCmd,  setStartCmd]  = useState('node dist/main.js');
  const [projType,  setProjType]  = useState('nodejs');
  const [detecting, setDetecting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [pushing,   setPushing]   = useState(false);
  const [detected,  setDetected]  = useState<BuildDetectResult | null>(null);
  const [dockerfileContent, setDockerfileContent] = useState('');
  const [gitlabCiContent,   setGitlabCiContent]   = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showPort     = engine !== 'STATIC';
  const showStartCmd = engine !== 'STATIC' && engine !== 'DOCKER_COMPOSE';
  const showType     = engine === 'DOCKERFILE' || engine === 'BUILDPACK';

  const handleDetect = async () => {
    setDetecting(true); setMsg(null);
    try {
      const r = await buildService.detect(projectId, '');
      setDetected(r);
      setEngine(
        r.recommendedStrategy === 'nixpacks' ? 'NIXPACKS'
        : r.recommendedStrategy === 'static-build' ? 'STATIC'
        : r.hasDockerCompose && !r.hasDockerfile ? 'DOCKER_COMPOSE'
        : 'DOCKERFILE',
      );
      setProjType(r.recommendedBuildType || r.type || projType);
      setPort(String(r.recommendedPort || port));
      setStartCmd(r.recommendedStartCommand || startCmd);
      setMsg({ type: 'success', text: `Détecté : ${r.type} · ${r.language} · confiance ${r.confidence}` });
    } catch (err) {
      setMsg({ type: 'error', text: getApiErrorMessage(err) });
    } finally {
      setDetecting(false);
    }
  };

  const handleGenerate = async () => {
    setPreparing(true); setMsg(null);
    try {
      await buildService.updateConfig(projectId, {
        projectType: projType,
        buildPort: parseInt(port, 10) || 3000,
        buildStartCmd: startCmd,
      });
      const result = await buildService.prepare(projectId, '', {});
      setDockerfileContent(result.dockerfileContent);
      setGitlabCiContent(result.gitlabCiContent);
      onGenerated();
      setMsg({ type: 'success', text: 'Fichiers générés.' });
    } catch (err) {
      setMsg({ type: 'error', text: getApiErrorMessage(err) });
    } finally {
      setPreparing(false);
    }
  };

  const handlePush = async () => {
    setPushing(true); setMsg(null);
    try {
      await buildService.updateConfig(projectId, { dockerfileContent, gitlabCiContent });
      await buildService.pushFiles(projectId, '');
      onGenerated();
      setMsg({ type: 'success', text: 'Fichiers poussés dans GitLab — pipeline déclenché.' });
    } catch (err) {
      setMsg({ type: 'error', text: getApiErrorMessage(err) });
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Configuration du build</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">Choisissez le moteur, détectez le framework, générez les fichiers.</p>
        </div>
        <button
          type="button"
          onClick={() => void handleDetect()}
          disabled={detecting || !isAdmin}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          {detecting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {detecting ? 'Détection…' : 'Détecter automatiquement'}
        </button>
      </div>

      <div className="space-y-5 p-5">
        {/* Engine selector — visual cards */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Moteur de build</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {ENGINES.map((eng) => (
              <button
                key={eng.id}
                type="button"
                disabled={!isAdmin}
                onClick={() => setEngine(eng.id)}
                className={clsx(
                  'flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition disabled:opacity-60',
                  engine === eng.id
                    ? 'border-[var(--text-primary)]/40 bg-[var(--text-primary)]/8 ring-1 ring-[var(--text-primary)]/20'
                    : 'border-[var(--border)] hover:border-[var(--text-primary)]/20 hover:bg-[var(--hover)]',
                )}
              >
                <div className={clsx('flex items-center gap-1.5 text-xs font-semibold', engine === eng.id ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]')}>
                  {eng.icon} {eng.label}
                </div>
                {eng.badge && (
                  <span className={clsx('text-[9px] font-bold', eng.badgeColor)}>{eng.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Fields */}
        <div className="grid gap-3 sm:grid-cols-3">
          {showType && (
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Framework</label>
              <select
                value={projType}
                onChange={(e) => setProjType(e.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none disabled:opacity-60"
              >
                {PROJECT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          )}
          {showPort && (
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Port exposé</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none disabled:opacity-60"
              />
            </div>
          )}
          {showStartCmd && (
            <div className={!showType ? 'sm:col-span-2' : ''}>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Commande de démarrage {engine === 'NIXPACKS' ? '(optionnel)' : ''}
              </label>
              <input
                type="text"
                value={startCmd}
                onChange={(e) => setStartCmd(e.target.value)}
                disabled={!isAdmin}
                placeholder={engine === 'NIXPACKS' ? 'auto-détecté' : 'node dist/main.js'}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none disabled:opacity-60"
              />
            </div>
          )}
        </div>

        {/* Detection result */}
        {detected && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
            <CheckCircle size={13} className="text-blue-400" />
            <span className="text-xs text-blue-300">
              {detected.type} · {detected.language} · confiance {detected.confidence}
            </span>
          </div>
        )}

        {/* Message */}
        {msg && (
          <div className={clsx('rounded-lg px-3 py-2 text-xs', msg.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20')}>
            {msg.text}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
          <Button
            onClick={() => void handleGenerate()}
            loading={preparing}
            disabled={!isAdmin}
            icon={preparing ? undefined : <Rocket size={13} />}
          >
            <span className="text-xs">Générer les fichiers</span>
          </Button>
          {dockerfileContent && (
            <Button
              variant="secondary"
              onClick={() => void handlePush()}
              loading={pushing}
              disabled={!isAdmin}
            >
              <span className="text-xs">Pousser dans GitLab</span>
            </Button>
          )}
        </div>

        {/* Files preview */}
        {dockerfileContent && (
          <BuildFilesPreview
            isAdmin={isAdmin}
            isVisible
            isGroupSource={false}
            selectedServiceReady
            dockerfileContent={dockerfileContent}
            gitlabCiContent={gitlabCiContent}
            preparing={preparing}
            pushing={pushing}
            savingFiles={false}
            onDockerfileChange={setDockerfileContent}
            onGitlabCiChange={setGitlabCiContent}
            onSaveFiles={async () => {
              try { await buildService.updateConfig(projectId, { dockerfileContent, gitlabCiContent }); }
              catch { /* ignore */ }
            }}
            onPrepare={() => void handleGenerate()}
            onPush={() => void handlePush()}
          />
        )}

        {/* Prepare results */}
        {prepareAllResults && prepareAllResults.map((r) => (
          <div key={r.serviceId} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--hover)] px-3 py-2">
            {r.status === 'SUCCESS' ? <CheckCircle2 size={13} className="text-green-400" /> : <XCircle size={13} className="text-red-400" />}
            <span className={`text-xs font-medium ${r.status === 'SUCCESS' ? 'text-green-300' : 'text-red-300'}`}>{r.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */

export function ProjectBuildTabContent({
  projectId,
  isAdmin,
  sourceType,
  hasEnvironment = true,
  onGoToEnvironments,
  onDeploy,
}: ProjectBuildTabContentProps) {
  const isGroupSource = sourceType === 'GROUP';

  const [services, setServices]         = useState<Service[]>([]);
  const [buildStatus, setBuildStatus]   = useState<BuildStatusResult | null>(null);
  const [buildStatusLoading, setBuildStatusLoading] = useState(false);
  const [servicesLoading, setServicesLoading]       = useState(false);

  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [prepareAllRunning,  setPrepareAllRunning]  = useState(false);
  const [prepareAllResults,  setPrepareAllResults]  = useState<BuildAllResult[] | null>(null);
  const [detectAllRunning,   setDetectAllRunning]   = useState(false);
  const [error,              setError]              = useState<string | null>(null);
  const [successMsg,         setSuccessMsg]         = useState<string | null>(null);

  const statusLoadRef = useRef<string | null>(null);

  const refreshBuildStatus = useCallback(() => {
    setBuildStatusLoading(true);
    buildService.getBuildStatus(projectId)
      .then(setBuildStatus)
      .catch(() => { /* ignore */ })
      .finally(() => setBuildStatusLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (statusLoadRef.current === projectId) return;
    statusLoadRef.current = projectId;
    refreshBuildStatus();
    if (!isGroupSource) return;
    setServicesLoading(true);
    // TODO: load services from environments
    setServices([]);
    setServicesLoading(false);
  }, [projectId, isGroupSource, refreshBuildStatus]);

  /* ── Merge service data ─────────────────────────────────────────── */
  const mergedServices = services.map((svc) => {
    const status = buildStatus?.services.find((s) => s.id === svc.id);
    return { ...svc, status };
  });

  /* ── Handlers ─────────────────────────────────────────────────────── */

  const handleDetectAll = async () => {
    setDetectAllRunning(true); setError(null); setSuccessMsg(null);
    try {
      const results: Array<{ id: string; result: string }> = [];
      for (const svc of services) {
        try {
          const r = await buildService.detect(projectId, svc.id);
          results.push({ id: svc.id, result: `${r.recommendedBuildType || r.type} · port ${r.recommendedPort}` });
        } catch { results.push({ id: svc.id, result: 'Échec détection' }); }
      }
      setSuccessMsg(`Détection terminée pour ${String(results.length)} service(s).`);
    } finally {
      setDetectAllRunning(false);
    }
  };

  const handlePrepareAll = async () => {
    setPrepareAllRunning(true); setError(null); setSuccessMsg(null); setPrepareAllResults(null);
    try {
      const res = await buildService.prepareAll(projectId);
      setPrepareAllResults(res.results);
      const failed = res.results.filter((r) => r.status === 'FAILED');
      if (failed.length === 0) setSuccessMsg(`${String(res.results.length)} service(s) préparés avec succès.`);
      else setError(`${String(failed.length)} service(s) en échec.`);
      refreshBuildStatus();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setPrepareAllRunning(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === services.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(services.map((s) => s.id)));
  };

  /* ── Build phase stepper ─────────────────────────────────────────── */
  const allReady = buildStatus && buildStatus.services.length > 0 && buildStatus.services.every((s) => s.ready);
  const hasSuccess = buildStatus?.services.some((s) => s.lastPipeline?.status === 'success');
  const buildPhase = hasSuccess ? 4 : allReady ? 3 : 2;

  const STEPS = [
    { id: 1, label: '① Détecter',  desc: 'Framework' },
    { id: 2, label: '② Préparer',  desc: 'Dockerfile + CI' },
    { id: 3, label: '③ Vérifier',  desc: 'Pipeline' },
    { id: 4, label: '④ Déployer',  desc: 'Production' },
  ];

  return (
    <div className="space-y-6">
      {/* Environment warning */}
      {!hasEnvironment && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-amber-300">Aucun environnement configuré</p>
            <p className="text-xs text-amber-400/70">Configurez un VPS dans l&apos;onglet Environments avant de déployer.</p>
          </div>
          {onGoToEnvironments && (
            <button type="button" onClick={onGoToEnvironments} className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/30">
              Configurer →
            </button>
          )}
        </div>
      )}

      {/* Stepper */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-1">
        <div className="grid grid-cols-4 gap-1">
          {STEPS.map((s) => {
            const done = s.id < buildPhase;
            const active = s.id === buildPhase;
            return (
              <div key={s.id} className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-center transition ${active ? 'bg-[var(--bg-card)] shadow-sm' : done ? 'opacity-70' : 'opacity-40'}`}>
                <span className={`text-xs font-bold ${done ? 'text-green-400' : active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                  {done ? '✓ ' : ''}{s.label}
                </span>
                <span className="hidden text-[10px] text-[var(--text-muted)] sm:block">{s.desc}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--border)]">
          <div className="h-1 rounded-full bg-green-500 transition-all duration-500" style={{ width: `${Math.max(5, (buildPhase - 1) * 33)}%` }} />
        </div>
      </div>

      {error    && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          <CheckCircle size={15} /> {successMsg}
        </div>
      )}

      <BuildStatusPanel buildStatus={buildStatus} buildStatusLoading={buildStatusLoading} onRefresh={refreshBuildStatus} />

      {/* ── Service table (GROUP source) ─────────────────────────── */}
      {isGroupSource && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          {/* Table header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectedIds.size === services.length && services.length > 0}
                onChange={toggleAll}
                className="h-4 w-4 rounded accent-[var(--text-primary)]"
              />
              <p className="text-sm font-semibold text-[var(--text-primary)]">Services</p>
              <span className="rounded-full bg-[var(--hover)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                {services.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleDetectAll()}
                disabled={detectAllRunning || !isAdmin}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                {detectAllRunning ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Détecter tout
              </button>
              <Button
                onClick={() => void handlePrepareAll()}
                disabled={prepareAllRunning || !isAdmin}
                loading={prepareAllRunning}
              >
                <span className="text-xs">
                  {selectedIds.size > 0 ? `Générer (${selectedIds.size})` : 'Générer tout'}
                </span>
              </Button>
            </div>
          </div>

          {servicesLoading ? (
            <div className="space-y-2 p-4">{[1,2,3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--hover)]" />)}</div>
          ) : services.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">
              Aucun service. Ajoutez des services dans l&apos;onglet <strong>Services</strong>.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {mergedServices.map((svc) => {
                const isExpanded = expandedId === svc.id;
                const pipeline = svc.status?.lastPipeline;
                const isReady = svc.status?.ready;
                const pipelineColor =
                  pipeline?.status === 'success' ? 'text-green-400 bg-green-500/10 border-green-500/20'
                  : pipeline?.status === 'failed'  ? 'text-red-400 bg-red-500/10 border-red-500/20'
                  : pipeline?.status === 'running' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                  : 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';

                return (
                  <div key={svc.id}>
                    {/* Service row */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(svc.id)}
                        onChange={() => toggleSelect(svc.id)}
                        className="h-4 w-4 shrink-0 rounded accent-[var(--text-primary)]"
                      />

                      {/* Status dot */}
                      <div className={clsx(
                        'h-2 w-2 shrink-0 rounded-full',
                        isReady ? 'bg-green-400' : 'bg-amber-400',
                      )} />

                      {/* Service info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{svc.name}</p>
                          <span className="rounded bg-[var(--hover)] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[var(--text-muted)]">{svc.type}</span>
                          {svc.buildPack && svc.buildPack !== 'DOCKERFILE' && (
                            <span className="rounded border border-purple-500/20 bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-purple-300">{svc.buildPack}</span>
                          )}
                        </div>
                        <p className="font-mono text-[10px] text-[var(--text-muted)]">{svc.name}</p>
                      </div>

                      {/* Pipeline status */}
                      <div className="shrink-0">
                        {pipeline ? (
                          <div className="flex items-center gap-1.5">
                            <span className={clsx('rounded-full border px-2 py-0.5 text-[10px] font-semibold', pipelineColor)}>
                              {pipeline.status}
                            </span>
                            <span className="font-mono text-[10px] text-[var(--text-muted)]">#{pipeline.id}</span>
                            {pipeline.webUrl && (
                              <a href={pipeline.webUrl} target="_blank" rel="noreferrer" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                                <ExternalLink size={11} />
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)]">Aucun pipeline</span>
                        )}
                      </div>

                      {/* Expand toggle */}
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : svc.id)}
                        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
                      >
                        {isExpanded ? <><ChevronUp size={12} /> Fermer</> : <><ChevronDown size={12} /> Configurer</>}
                      </button>
                    </div>

                    {/* Inline config panel */}
                    {isExpanded && (
                      <div className="px-4 pb-4">
                        <ServiceConfigPanel
                          service={svc}
                          isAdmin={isAdmin}
                          projectId={projectId}
                          initialConfig={{
                            engine: svc.buildPack ?? 'DOCKERFILE',
                            port: '3000',
                            startCmd: 'node dist/main.js',
                            type: 'nodejs',
                          }}
                          onClose={() => setExpandedId(null)}
                          onGenerated={() => { refreshBuildStatus(); }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Prepare all results */}
          {prepareAllResults && (
            <div className="border-t border-[var(--border)] p-4 space-y-1.5">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">Résultats :</p>
              {prepareAllResults.map((r) => (
                <div key={r.serviceId} className="flex items-center gap-2 rounded-lg bg-[var(--hover)] px-3 py-2">
                  {r.status === 'SUCCESS' ? <CheckCircle2 size={13} className="text-green-400" /> : <XCircle size={13} className="text-red-400" />}
                  <span className="text-xs font-semibold text-[var(--text-primary)]">{r.serviceName}</span>
                  <span className="text-xs text-[var(--text-muted)]">· Dockerfile: {r.dockerfileStatus} · CI: {r.ciStatus}</span>
                  {r.pipelineUrl && (
                    <a href={r.pipelineUrl} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-xs text-blue-300">
                      Pipeline <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── REPO source — interactive build config ────────────────── */}
      {!isGroupSource && (
        <RepoBuildConfig
          projectId={projectId}
          isAdmin={isAdmin}
          prepareAllResults={prepareAllResults}
          onGenerated={refreshBuildStatus}
        />
      )}

      {/* ── CTA Déployer ──────────────────────────────────────────── */}
      {allReady && hasEnvironment && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-green-500/30 bg-green-500/5 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-green-300">✅ Build configuré — Prêt à déployer</p>
            <p className="mt-0.5 text-xs text-green-400/70">Tous les services ont un Dockerfile et un pipeline CI configurés.</p>
          </div>
          <button
            type="button"
            onClick={onDeploy}
            className="shrink-0 flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] shadow transition hover:opacity-90"
          >
            <Rocket size={14} /> Déployer maintenant
          </button>
        </div>
      )}
      {allReady && !hasEnvironment && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-amber-300">✅ Build prêt — Environnement manquant</p>
            <p className="mt-0.5 text-xs text-amber-400/70">Configurez un VPS dans l&apos;onglet Environments pour déployer.</p>
          </div>
          {onGoToEnvironments && (
            <button type="button" onClick={onGoToEnvironments}
              className="shrink-0 rounded-xl border border-amber-500/30 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/25">
              Configurer l&apos;env →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
