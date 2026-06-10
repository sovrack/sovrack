'use client';

import { Box, CheckCircle, Code2, Cpu, Globe, Layers, Sparkles } from 'lucide-react';
import { SectionCard } from '@/components/layout/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import clsx from 'clsx';
import type { BuildDetectResult } from '@/services/build.service';

/* ─── Build engine cards ────────────────────────────────────────────────── */

type EngineCard = {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
  hint?: string;
};

const ENGINE_CARDS: EngineCard[] = [
  {
    id: 'DOCKERFILE',
    label: 'Dockerfile',
    description: 'Génère un Dockerfile optimisé par framework. Buildé via GitLab CI ou local.',
    icon: <Code2 size={16} />,
    badge: 'Recommandé',
    badgeColor: 'border-green-500/30 bg-green-500/10 text-green-300',
  },
  {
    id: 'NIXPACKS',
    label: 'Nixpacks',
    description: 'Zéro configuration — détecte automatiquement le framework et build l\'image.',
    icon: <Sparkles size={16} />,
    badge: 'Auto-detect',
    badgeColor: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
    hint: 'Nixpacks doit être installé sur le VPS cible.',
  },
  {
    id: 'BUILDPACK',
    label: 'Buildpack',
    description: 'Style Heroku — utilise le CLI pack pour builder sans Dockerfile.',
    icon: <Layers size={16} />,
  },
  {
    id: 'DOCKER_COMPOSE',
    label: 'Docker Compose',
    description: 'Déploie directement le docker-compose.yml existant dans le repo.',
    icon: <Box size={16} />,
  },
  {
    id: 'STATIC',
    label: 'Site statique',
    description: 'Build les assets et les sert via Nginx. Aucun Docker requis.',
    icon: <Globe size={16} />,
  },
];

/* ─── Project types (by engine) ─────────────────────────────────────────── */

const PROJECT_TYPES_BY_ENGINE: Record<string, { value: string; label: string }[]> = {
  DOCKERFILE: [
    { value: 'nestjs', label: 'NestJS API' },
    { value: 'nextjs', label: 'Next.js App' },
    { value: 'react', label: 'React SPA' },
    { value: 'nodejs', label: 'Node.js' },
    { value: 'python', label: 'Python' },
    { value: 'django', label: 'Django' },
    { value: 'go', label: 'Go Service' },
    { value: 'golang', label: 'Go' },
    { value: 'java', label: 'Java' },
    { value: 'spring-boot', label: 'Spring Boot' },
    { value: 'php', label: 'PHP' },
    { value: 'laravel', label: 'Laravel' },
    { value: 'ruby', label: 'Ruby' },
    { value: 'rust', label: 'Rust' },
    { value: 'static-frontend', label: 'Static Frontend' },
    { value: 'dockerized', label: 'Dockerfile existant' },
  ],
  NIXPACKS: [
    { value: 'nestjs', label: 'NestJS API' },
    { value: 'nextjs', label: 'Next.js App' },
    { value: 'react', label: 'React SPA' },
    { value: 'nodejs', label: 'Node.js' },
    { value: 'python', label: 'Python' },
    { value: 'django', label: 'Django' },
    { value: 'go', label: 'Go Service' },
    { value: 'php', label: 'PHP' },
    { value: 'ruby', label: 'Ruby' },
    { value: 'rust', label: 'Rust' },
  ],
  BUILDPACK: [
    { value: 'nodejs', label: 'Node.js' },
    { value: 'python', label: 'Python' },
    { value: 'java', label: 'Java' },
    { value: 'go', label: 'Go' },
    { value: 'ruby', label: 'Ruby' },
    { value: 'php', label: 'PHP' },
  ],
  DOCKER_COMPOSE: [
    { value: 'compose', label: 'Docker Compose' },
  ],
  STATIC: [
    { value: 'static', label: 'Site statique' },
    { value: 'react', label: 'React SPA (static)' },
    { value: 'nextjs', label: 'Next.js (export)' },
  ],
};

function confidenceBadge(confidence: string) {
  if (confidence === 'high') return <Badge tone="success" size="sm">Haute confiance</Badge>;
  if (confidence === 'medium') return <Badge tone="warning" size="sm">Confiance moyenne</Badge>;
  return <Badge tone="default" size="sm">Faible confiance</Badge>;
}

export type BuildTypeSelectorProps = {
  isGroupSource: boolean;
  isAdmin: boolean;
  servicesCount: number;
  selectedServiceId: string;
  selectedServiceReady: boolean;
  detecting: boolean;
  detectAllRunning: boolean;
  detected: BuildDetectResult | null;
  detectAllResults: Array<{
    serviceId: string;
    serviceName: string;
    status: 'SUCCESS' | 'FAILED';
    message: string;
  }> | null;
  selectedType: string;
  selectedEngine: string;
  port: string;
  startCmd: string;
  onDetect: () => void;
  onDetectAll: () => void;
  onSelectedTypeChange: (value: string) => void;
  onEngineChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onStartCmdChange: (value: string) => void;
};

export function BuildTypeSelector({
  isGroupSource,
  isAdmin,
  servicesCount,
  selectedServiceId,
  selectedServiceReady,
  detecting,
  detectAllRunning,
  detected,
  detectAllResults,
  selectedType,
  selectedEngine,
  port,
  startCmd,
  onDetect,
  onDetectAll,
  onSelectedTypeChange,
  onEngineChange,
  onPortChange,
  onStartCmdChange,
}: BuildTypeSelectorProps) {
  const projectTypes = PROJECT_TYPES_BY_ENGINE[selectedEngine] ?? PROJECT_TYPES_BY_ENGINE.DOCKERFILE;
  const activeEngine = ENGINE_CARDS.find((e) => e.id === selectedEngine) ?? ENGINE_CARDS[0];

  return (
    <>
      {/* ── Build Engine Selector ────────────────────────────────────── */}
      <SectionCard
        title="Moteur de build"
        description="Choisissez comment votre code sera transformé en image déployable."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {ENGINE_CARDS.map((engine) => (
            <button
              key={engine.id}
              type="button"
              onClick={() => {
                onEngineChange(engine.id);
                // Reset project type when engine changes
                const types = PROJECT_TYPES_BY_ENGINE[engine.id] ?? [];
                if (types.length > 0 && !types.find((t) => t.value === selectedType)) {
                  onSelectedTypeChange(types[0].value);
                }
              }}
              disabled={!isAdmin}
              className={clsx(
                'relative flex flex-col gap-1.5 rounded-xl border p-3 text-left transition disabled:opacity-60',
                selectedEngine === engine.id
                  ? 'border-[var(--text-primary)]/40 bg-[var(--text-primary)]/8 shadow-sm'
                  : 'border-[var(--border)] hover:border-[var(--text-primary)]/20 hover:bg-[var(--hover)]',
              )}
            >
              {engine.badge && (
                <span className={clsx('absolute right-1.5 top-1.5 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase', engine.badgeColor)}>
                  {engine.badge}
                </span>
              )}
              <div className={clsx(
                'flex h-7 w-7 items-center justify-center rounded-lg',
                selectedEngine === engine.id
                  ? 'bg-[var(--text-primary)]/15 text-[var(--text-primary)]'
                  : 'bg-[var(--hover)] text-[var(--text-muted)]',
              )}>
                {engine.icon}
              </div>
              <p className={clsx(
                'text-xs font-semibold',
                selectedEngine === engine.id ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]',
              )}>
                {engine.label}
              </p>
              <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">{engine.description}</p>
              {selectedEngine === engine.id && (
                <CheckCircle size={12} className="absolute bottom-2 right-2 text-[var(--text-primary)]" />
              )}
            </button>
          ))}
        </div>

        {/* Engine-specific hint */}
        {activeEngine.hint && (
          <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            ℹ {activeEngine.hint}
          </div>
        )}

        {/* Detection */}
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={onDetect}
              disabled={detecting || !isAdmin || (isGroupSource && (!selectedServiceId || !selectedServiceReady))}
              loading={detecting}
              icon={detecting ? undefined : <Cpu size={14} />}
            >
              {isGroupSource ? 'Détecter le service sélectionné' : 'Détecter automatiquement'}
            </Button>
            {isGroupSource && servicesCount > 1 && (
              <Button
                variant="secondary"
                onClick={onDetectAll}
                disabled={detectAllRunning || !isAdmin}
                loading={detectAllRunning}
                icon={detectAllRunning ? undefined : <Layers size={14} />}
              >
                Détecter tous les services
              </Button>
            )}
          </div>

          {detectAllResults && (
            <div className="space-y-1.5">
              {detectAllResults.map((entry) => (
                <div key={entry.serviceId} className="rounded-lg border border-[var(--border)] bg-[var(--hover)] px-3 py-2 text-xs">
                  <span className={`font-semibold ${entry.status === 'SUCCESS' ? 'text-green-300' : 'text-red-300'}`}>
                    {entry.serviceName}
                  </span>
                  <span className="text-[var(--text-muted)]"> · {entry.message}</span>
                </div>
              ))}
            </div>
          )}

          {detected && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{detected.type}</span>
                {confidenceBadge(detected.confidence)}
                <Badge tone="default" size="sm">{detected.framework}</Badge>
                <Badge tone="default" size="sm">{detected.language}</Badge>
                <Badge tone="default" size="sm">{detected.packageManager}</Badge>
              </div>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                Strategy recommandée: <span className="font-semibold">{detected.recommendedStrategy}</span>
                {' '}· Port {detected.recommendedPort}
                {' '}· <code className="font-mono">{detected.recommendedStartCommand}</code>
              </p>
              {detected.reasons.length > 0 && (
                <p className="mt-1 text-xs text-[var(--text-muted)]">Signaux: {detected.reasons.join(' · ')}</p>
              )}
              {/* Auto-apply recommended engine */}
              {detected.recommendedStrategy === 'nixpacks' && selectedEngine !== 'NIXPACKS' && (
                <button
                  type="button"
                  onClick={() => onEngineChange('NIXPACKS')}
                  className="mt-2 text-xs font-semibold text-purple-300 underline hover:text-purple-200"
                >
                  Passer à Nixpacks (recommandé) →
                </button>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Project Type + Config ────────────────────────────────────── */}
      {selectedEngine !== 'DOCKER_COMPOSE' && (
        <SectionCard title="Configuration" description="Type de projet, port et commande de démarrage.">
          <div className="space-y-5">
            {/* Project type — hidden for STATIC (only one option) */}
            {selectedEngine !== 'STATIC' && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
                  Type de projet
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => onSelectedTypeChange(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-60"
                >
                  <option value="">-- Sélectionner --</option>
                  {projectTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
                  Port de l&apos;application
                </label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => onPortChange(e.target.value)}
                  disabled={!isAdmin}
                  min={1}
                  max={65535}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-60"
                />
              </div>
              {selectedEngine !== 'STATIC' && selectedEngine !== 'DOCKER_COMPOSE' && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
                    Commande de démarrage
                  </label>
                  <input
                    type="text"
                    value={startCmd}
                    onChange={(e) => onStartCmdChange(e.target.value)}
                    disabled={!isAdmin}
                    placeholder={selectedEngine === 'NIXPACKS' ? 'auto-détecté par nixpacks' : 'dist/main.js / app.py / ...'}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-60"
                  />
                </div>
              )}
            </div>

          </div>
        </SectionCard>
      )}

      {selectedEngine === 'DOCKER_COMPOSE' && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
          <p className="font-semibold">Mode Docker Compose</p>
          <p className="mt-1 text-xs text-blue-400/80">
            Le fichier <code className="font-mono">docker-compose.yml</code> de votre repo sera copié et lancé sur le VPS via <code className="font-mono">docker-compose up -d</code>. Aucun Dockerfile généré.
          </p>
        </div>
      )}
    </>
  );
}
