'use client';

import { useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  CheckCircle,
  Code2,
  Cpu,
  RefreshCw,
  Rocket,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { SectionCard } from '@/components/layout/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buildService, type BuildDetectResult, type BuildPrepareResult } from '@/services/build.service';
import { getApiErrorMessage } from '@/lib/api';

const PROJECT_TYPES = [
  { value: 'nodejs', label: 'Node.js' },
  { value: 'python', label: 'Python' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'golang', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'static', label: 'Site statique' },
  { value: 'docker', label: 'Dockerfile existant' },
  { value: 'compose', label: 'Docker Compose' },
];

function confidenceBadge(confidence: string) {
  if (confidence === 'high') return <Badge tone="success" size="sm">Haute confiance</Badge>;
  if (confidence === 'medium') return <Badge tone="warning" size="sm">Confiance moyenne</Badge>;
  return <Badge tone="default" size="sm">Faible confiance</Badge>;
}

type Props = { projectId: string; isAdmin: boolean };

export function ProjectBuildTab({ projectId, isAdmin }: Props) {
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<BuildDetectResult | null>(null);
  const [selectedType, setSelectedType] = useState('');
  const [port, setPort] = useState('3000');
  const [startCmd, setStartCmd] = useState('dist/main.js');
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [autoDeployBranch, setAutoDeployBranch] = useState('develop');
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<BuildPrepareResult | null>(null);
  const [dockerfileContent, setDockerfileContent] = useState('');
  const [gitlabCiContent, setGitlabCiContent] = useState('');
  const [pushing, setPushing] = useState(false);
  const [savingFiles, setSavingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleDetect = async () => {
    setDetecting(true);
    setError(null);
    try {
      const result = await buildService.detect(projectId);
      setDetected(result);
      setSelectedType(result.type);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setDetecting(false);
    }
  };

  const handlePrepare = async () => {
    setPreparing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await buildService.updateConfig(projectId, {
        projectType: selectedType,
        buildPort: parseInt(port, 10),
        buildStartCmd: startCmd,
        autoDeploy,
        autoDeployBranch: autoDeploy ? autoDeployBranch : undefined,
      });
      const result = await buildService.prepare(projectId);
      setPrepared(result);
      setDockerfileContent(result.dockerfileContent);
      setGitlabCiContent(result.gitlabCiContent);
      setSuccessMsg('Fichiers générés et poussés dans le repo GitLab. Webhook configuré.');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setPreparing(false);
    }
  };

  const handleSaveFiles = async () => {
    setSavingFiles(true);
    setError(null);
    try {
      await buildService.updateConfig(projectId, {
        dockerfileContent,
        gitlabCiContent,
      });
      setSuccessMsg('Fichiers sauvegardés en base.');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSavingFiles(false);
    }
  };

  const handlePushFiles = async () => {
    setPushing(true);
    setError(null);
    try {
      // Sauvegarder d'abord les modifications
      await buildService.updateConfig(projectId, { dockerfileContent, gitlabCiContent });
      await buildService.pushFiles(projectId);
      setSuccessMsg('Fichiers poussés dans le repo GitLab.');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          <CheckCircle size={15} /> {successMsg}
        </div>
      )}

      {/* Détection automatique */}
      <SectionCard
        title="Type de projet"
        description="Détectez automatiquement ou choisissez manuellement le type de votre projet."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void handleDetect()}
              disabled={detecting || !isAdmin}
              loading={detecting}
              icon={detecting ? undefined : <Cpu size={14} />}
            >
              Détecter automatiquement
            </Button>
            {detected && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{detected.type}</span>
                {confidenceBadge(detected.confidence)}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
              Type de projet
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-60"
            >
              <option value="">-- Sélectionner --</option>
              {PROJECT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>
      </SectionCard>

      {/* Configuration */}
      <SectionCard
        title="Configuration"
        description="Port, commande de démarrage et déploiement automatique."
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
                Port de l&apos;application
              </label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                disabled={!isAdmin}
                min={1}
                max={65535}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
                Commande de démarrage
              </label>
              <input
                type="text"
                value={startCmd}
                onChange={(e) => setStartCmd(e.target.value)}
                disabled={!isAdmin}
                placeholder="dist/main.js / app.py / ..."
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-60"
              />
            </div>
          </div>

          {/* Auto-deploy */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Auto-deploy</p>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  Déployer automatiquement sur succès du pipeline GitLab.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAutoDeploy((v) => !v)}
                disabled={!isAdmin}
                className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                {autoDeploy
                  ? <ToggleRight size={28} className="text-green-500" />
                  : <ToggleLeft size={28} />}
              </button>
            </div>
            {autoDeploy && (
              <div className="mt-3">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
                  Branche déclencheur
                </label>
                <input
                  type="text"
                  value={autoDeployBranch}
                  onChange={(e) => setAutoDeployBranch(e.target.value)}
                  disabled={!isAdmin}
                  placeholder="develop / main / *"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-60"
                />
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Utilisez <code className="font-mono">*</code> pour toutes les branches.
                </p>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Actions principales */}
      <SectionCard
        title="Préparation du projet"
        description="Génère le Dockerfile et le .gitlab-ci.yml, les pousse dans GitLab et configure le webhook."
      >
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => void handlePrepare()}
            disabled={preparing || !isAdmin || !selectedType}
            loading={preparing}
            icon={preparing ? undefined : <Rocket size={14} />}
          >
            Préparer le projet
          </Button>
        </div>
      </SectionCard>

      {/* Éditeur de fichiers générés */}
      {(prepared ?? dockerfileContent) && (
        <SectionCard
          title="Fichiers générés"
          description="Modifiez les fichiers générés puis poussez-les dans votre repo GitLab."
          contentClassName="space-y-5"
        >
          {/* Dockerfile */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
                Dockerfile
              </p>
            </div>
            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              <Editor
                height="320px"
                defaultLanguage="dockerfile"
                value={dockerfileContent}
                onChange={(v) => setDockerfileContent(v ?? '')}
                options={{ readOnly: !isAdmin, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
                theme="vs-dark"
              />
            </div>
          </div>

          {/* .gitlab-ci.yml */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
              .gitlab-ci.yml
            </p>
            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              <Editor
                height="320px"
                defaultLanguage="yaml"
                value={gitlabCiContent}
                onChange={(v) => setGitlabCiContent(v ?? '')}
                options={{ readOnly: !isAdmin, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
                theme="vs-dark"
              />
            </div>
          </div>

          {/* Boutons fichiers */}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => void handleSaveFiles()}
              disabled={savingFiles || !isAdmin}
              loading={savingFiles}
              icon={savingFiles ? undefined : <Code2 size={14} />}
            >
              Sauvegarder les modifications
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handlePushFiles()}
              disabled={pushing || !isAdmin}
              loading={pushing}
              icon={pushing ? undefined : <RefreshCw size={14} />}
            >
              Pousser dans GitLab
            </Button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
