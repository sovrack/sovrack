'use client';

import { useState } from 'react';
import {
  CheckCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Rocket,
  XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import {
  buildService,
  type BuildDetectResult,
  type BuildAllResult,
} from '@/services/build.service';
import { getApiErrorMessage } from '@/lib/api';
import { BuildFilesPreview } from './build-files-preview';
import { ENGINES, PROJECT_TYPES } from './build-engine-options';

export type RepoBuildConfigProps = {
  projectId: string;
  isAdmin: boolean;
  prepareAllResults: BuildAllResult[] | null;
  onGenerated: () => void;
};

/** REPO source — interactive single-app build config. */
export function RepoBuildConfig({ projectId, isAdmin, prepareAllResults, onGenerated }: RepoBuildConfigProps) {
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
