'use client';

import { Cpu, Layers, ToggleLeft, ToggleRight } from 'lucide-react';
import { SectionCard } from '@/components/layout/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { BuildDetectResult } from '@/services/build.service';

const PROJECT_TYPES = [
  { value: 'nestjs', label: 'NestJS API' },
  { value: 'nextjs', label: 'Next.js App' },
  { value: 'react', label: 'React SPA' },
  { value: 'nodejs', label: 'Node.js' },
  { value: 'go', label: 'Go Service' },
  { value: 'python', label: 'Python' },
  { value: 'django', label: 'Django' },
  { value: 'laravel', label: 'Laravel' },
  { value: 'spring-boot', label: 'Spring Boot' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'golang', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'postgres-service', label: 'PostgreSQL Service' },
  { value: 'redis-service', label: 'Redis Service' },
  { value: 'dockerized', label: 'Dockerized App' },
  { value: 'static-frontend', label: 'Static Frontend' },
  { value: 'static', label: 'Site statique' },
  { value: 'docker', label: 'Dockerfile existant' },
  { value: 'compose', label: 'Docker Compose' },
];

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
  port: string;
  startCmd: string;
  autoDeploy: boolean;
  autoDeployBranch: string;
  onDetect: () => void;
  onDetectAll: () => void;
  onSelectedTypeChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onStartCmdChange: (value: string) => void;
  onAutoDeployToggle: () => void;
  onAutoDeployBranchChange: (value: string) => void;
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
  port,
  startCmd,
  autoDeploy,
  autoDeployBranch,
  onDetect,
  onDetectAll,
  onSelectedTypeChange,
  onPortChange,
  onStartCmdChange,
  onAutoDeployToggle,
  onAutoDeployBranchChange,
}: BuildTypeSelectorProps) {
  return (
    <>
      {/* Detection */}
      <SectionCard
        title="Type de projet"
        description="Détectez automatiquement ou choisissez manuellement le type de votre projet."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
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
            {detectAllResults && (
              <div className="w-full space-y-1.5">
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
              <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{detected.type}</span>
                  {confidenceBadge(detected.confidence)}
                  <Badge tone="default" size="sm">{detected.framework}</Badge>
                  <Badge tone="default" size="sm">{detected.language}</Badge>
                  <Badge tone="default" size="sm">{detected.packageManager}</Badge>
                </div>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  Strategy: <span className="font-semibold">{detected.recommendedStrategy}</span>
                  {' '}· Port {detected.recommendedPort}
                  {' '}· <code className="font-mono">{detected.recommendedStartCommand}</code>
                </p>
                {detected.reasons.length > 0 && (
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">Signals: {detected.reasons.join(' · ')}</p>
                )}
              </div>
            )}
          </div>

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
              {PROJECT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>
      </SectionCard>

      {/* Configuration */}
      <SectionCard title="Configuration" description="Port, commande de démarrage et déploiement automatique.">
        <div className="space-y-5">
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
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
                Commande de démarrage
              </label>
              <input
                type="text"
                value={startCmd}
                onChange={(e) => onStartCmdChange(e.target.value)}
                disabled={!isAdmin}
                placeholder="dist/main.js / app.py / ..."
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-60"
              />
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Auto-deploy</p>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">Déployer automatiquement sur succès du pipeline GitLab.</p>
              </div>
              <button
                type="button"
                onClick={onAutoDeployToggle}
                disabled={!isAdmin}
                className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                {autoDeploy ? <ToggleRight size={28} className="text-green-500" /> : <ToggleLeft size={28} />}
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
                  onChange={(e) => onAutoDeployBranchChange(e.target.value)}
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
    </>
  );
}
