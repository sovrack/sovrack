'use client';

import { useState } from 'react';
import { Rocket, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import { buildService, type BuildDetectResult } from '@/services/build.service';
import { getApiErrorMessage } from '@/lib/api';
import type { Service } from '@/types/service';
import { BuildFilesPreview } from './build-files-preview';
import { ENGINES, PROJECT_TYPES, type ServiceLocalConfig } from './build-engine-options';

/** Inline per-service build config panel (expanded under a service row). */
export function ServiceConfigPanel({
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
