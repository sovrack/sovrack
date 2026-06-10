'use client';

import { useEffect, useState } from 'react';
import { Box, CheckCircle, Code2, Globe, Layers, Sparkles, X } from 'lucide-react';
import clsx from 'clsx';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/api';
import { buildService } from '@/services/build.service';

type BuildEngine = 'DOCKERFILE' | 'NIXPACKS' | 'BUILDPACK' | 'DOCKER_COMPOSE' | 'STATIC';

type EngineOption = {
  value: BuildEngine;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  badgeColor?: string;
  projectType: string;
};

const ENGINE_OPTIONS: EngineOption[] = [
  {
    value: 'DOCKERFILE',
    icon: <Code2 size={20} />,
    title: 'Dockerfile',
    description: 'Génère un Dockerfile optimisé par framework. Build via GitLab CI ou local sur VPS.',
    badge: 'Recommandé',
    badgeColor: 'border-green-500/30 bg-green-500/10 text-green-300',
    projectType: 'nodejs',
  },
  {
    value: 'NIXPACKS',
    icon: <Sparkles size={20} />,
    title: 'Nixpacks',
    description: 'Zéro Dockerfile — détecte automatiquement le framework et build l\'image.',
    badge: 'Auto-detect',
    badgeColor: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
    projectType: 'nixpacks',
  },
  {
    value: 'BUILDPACK',
    icon: <Layers size={20} />,
    title: 'Buildpack',
    description: 'Style Heroku — le CLI pack détecte le runtime et construit sans Dockerfile.',
    projectType: 'nodejs',
  },
  {
    value: 'DOCKER_COMPOSE',
    icon: <Box size={20} />,
    title: 'Docker Compose',
    description: 'Déploie le docker-compose.yml existant dans votre repo tel quel.',
    projectType: 'compose',
  },
  {
    value: 'STATIC',
    icon: <Globe size={20} />,
    title: 'Site statique',
    description: 'Build les assets statiques et les sert via Nginx. Aucun Docker requis.',
    projectType: 'static',
  },
];

function mapDetectedTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    nestjs: 'NestJS détecté', nextjs: 'Next.js détecté', react: 'React détecté',
    go: 'Go détecté', django: 'Django détecté', laravel: 'Laravel détecté',
    'spring-boot': 'Spring Boot détecté', dockerized: 'App Dockerisée détectée',
    'static-frontend': 'Frontend statique détecté', nodejs: 'Node.js détecté',
    python: 'Python détecté', php: 'PHP détecté', ruby: 'Ruby détecté',
    docker: 'Dockerfile détecté', compose: 'Docker Compose détecté',
  };
  return labels[type] ?? 'Runtime détecté';
}

type ProjectBuildSetupDialogProps = {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onDone: () => Promise<void> | void;
};

export function ProjectBuildSetupDialog({
  open,
  projectId,
  onClose,
  onDone,
}: ProjectBuildSetupDialogProps) {
  const [detectLoading, setDetectLoading] = useState(false);
  const [detectedType, setDetectedType] = useState('nodejs');
  const [detectedLabel, setDetectedLabel] = useState('Runtime détecté');
  const [engine, setEngine] = useState<BuildEngine>('DOCKERFILE');
  const [buildPort, setBuildPort] = useState('3000');
  const [startCmd, setStartCmd] = useState('npm start');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDone(false);
    setEngine('DOCKERFILE');
    setBuildPort('3000');
    setStartCmd('npm start');
    setDetectedType('nodejs');
    setDetectedLabel('Runtime détecté');

    setDetectLoading(true);
    buildService.getBuildStatus(projectId)
      .then(async (status) => {
        if (status.sourceType === 'GROUP') {
          setDetectedType('nodejs');
          return;
        }
        const result = await buildService.detect(projectId);
        const type = result.recommendedBuildType || result.type || 'nodejs';
        setDetectedType(type);
        setDetectedLabel(mapDetectedTypeLabel(type));
        setBuildPort(String(result.recommendedPort || 3000));
        setStartCmd(result.recommendedStartCommand || 'npm start');
        // Auto-select engine from detection
        if (result.recommendedStrategy === 'nixpacks') setEngine('NIXPACKS');
        else if (result.recommendedStrategy === 'static-build') setEngine('STATIC');
        else if (result.hasDockerCompose && !result.hasDockerfile) setEngine('DOCKER_COMPOSE');
        else setEngine('DOCKERFILE');
      })
      .catch(() => {
        setDetectedType('nodejs');
        setDetectedLabel('Runtime détecté');
      })
      .finally(() => setDetectLoading(false));
  }, [open, projectId]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const selectedOption = ENGINE_OPTIONS.find((o) => o.value === engine)!;
      const portNumber = parseInt(buildPort, 10);
      await buildService.updateConfig(projectId, {
        projectType: engine === 'DOCKERFILE' ? detectedType : selectedOption.projectType,
        buildPort: Number.isFinite(portNumber) && portNumber > 0 ? portNumber : 3000,
        buildStartCmd: startCmd.trim() || 'npm start',
      });
      setDone(true);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />

      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">Étape 3 / 3</p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">Configurer le Build</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Choisissez le moteur de build et les paramètres de démarrage.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text-primary)]">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {error && <Alert tone="error">{error}</Alert>}

          {!done ? (
            <>
              {/* Detection result */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {detectLoading ? 'Détection du runtime en cours…' : `✅ ${detectedLabel}`}
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Port : {buildPort} · Commande : <code className="font-mono">{startCmd}</code>
                </p>
              </div>

              {/* Engine cards */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                  Moteur de build
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {ENGINE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEngine(opt.value)}
                      className={clsx(
                        'relative flex flex-col gap-2 rounded-xl border p-3 text-left transition',
                        engine === opt.value
                          ? 'border-[var(--text-primary)]/40 bg-[var(--text-primary)]/8 shadow-sm'
                          : 'border-[var(--border)] hover:border-[var(--text-primary)]/20 hover:bg-[var(--hover)]',
                      )}
                    >
                      {opt.badge && (
                        <span className={clsx('absolute right-2 top-2 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase', opt.badgeColor)}>
                          {opt.badge}
                        </span>
                      )}
                      <div className={clsx(
                        'flex h-8 w-8 items-center justify-center rounded-lg',
                        engine === opt.value ? 'bg-[var(--text-primary)]/15 text-[var(--text-primary)]' : 'bg-[var(--hover)] text-[var(--text-muted)]',
                      )}>
                        {opt.icon}
                      </div>
                      <p className={clsx('text-xs font-semibold', engine === opt.value ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]')}>
                        {opt.title}
                      </p>
                      <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">{opt.description}</p>
                      {engine === opt.value && <CheckCircle size={13} className="absolute bottom-2 right-2 text-[var(--text-primary)]" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Port + start command (hidden for compose) */}
              {engine !== 'DOCKER_COMPOSE' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">Port</label>
                    <input
                      type="number"
                      min={1}
                      value={buildPort}
                      onChange={(e) => setBuildPort(e.target.value)}
                      className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-zinc-500/20"
                    />
                  </div>
                  {engine !== 'STATIC' && (
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                        Commande de démarrage
                        {engine === 'NIXPACKS' && <span className="ml-1 text-[var(--text-muted)]">(optionnel, auto-détecté)</span>}
                      </label>
                      <input
                        type="text"
                        value={startCmd}
                        onChange={(e) => setStartCmd(e.target.value)}
                        placeholder={engine === 'NIXPACKS' ? 'auto-détecté par nixpacks' : 'npm start'}
                        className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 font-mono text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-zinc-500/20"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
                <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Fermer</Button>
                <Button type="button" onClick={() => void handleSave()} loading={saving}>
                  Sauvegarder la config
                </Button>
              </div>
            </>
          ) : (
            <>
              <Alert tone="success" title="Configuration sauvegardée">
                Le moteur de build et les paramètres ont été enregistrés. Vous pouvez maintenant générer les fichiers dans l&apos;onglet Build.
              </Alert>
              <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
                <Button type="button" variant="secondary" onClick={onClose}>Fermer</Button>
                <Button type="button" onClick={() => void onDone()}>Terminer l&apos;onboarding</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
