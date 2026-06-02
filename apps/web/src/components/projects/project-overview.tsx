'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  GitBranch,
  Loader2,
  Rocket,
  RotateCcw,
  Server,
  Users,
  Wrench,
} from 'lucide-react';
import type { ProjectDetail, GitlabConfig } from '@/types/project';
import type { Deployment } from '@/types/deployment';
import type { Environment } from '@/types/environment';
import { deploymentsService } from '@/services/deployments.service';
import { getApiErrorMessage } from '@/lib/api';
import { DeploymentStatusBadge } from '@/components/deployments/deployment-status-badge';

type ProjectOverviewProps = {
  project: ProjectDetail;
  lastDeployment?: Deployment | null;
  gitlabConfig?: GitlabConfig | null;
  environments?: Environment[];
  onRollbackDone?: () => void;
  onTabChange?: (tab: string) => void;
  onOpenBuild?: () => void;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

type Step = {
  id: string;
  label: string;
  description: string;
  done: boolean;
  tab?: string;
  icon: React.ReactNode;
};

export function ProjectOverview({
  project,
  lastDeployment,
  gitlabConfig,
  environments = [],
  onRollbackDone,
  onTabChange,
  onOpenBuild,
}: ProjectOverviewProps) {
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackError, setRollbackError] = useState<string | null>(null);

  const canRollback = lastDeployment && (lastDeployment.status === 'SUCCESS' || lastDeployment.status === 'FAILED');

  const handleRollback = async () => {
    if (!lastDeployment || !confirm('Rollback vers la dernière version stable ?')) return;
    setRollingBack(true);
    setRollbackError(null);
    try {
      await deploymentsService.rollback(lastDeployment.id);
      onRollbackDone?.();
    } catch (err) {
      setRollbackError(getApiErrorMessage(err));
    } finally {
      setRollingBack(false);
    }
  };

  const steps: Step[] = [
    {
      id: 'gitlab',
      label: 'Connecter GitLab',
      description: gitlabConfig
        ? `${gitlabConfig.sourceType === 'GROUP' ? 'Groupe' : 'Repo'} connecté`
        : 'Associez un dépôt ou groupe GitLab',
      done: !!gitlabConfig,
      tab: 'gitlab',
      icon: <GitBranch size={14} />,
    },
    {
      id: 'environment',
      label: 'Configurer un environnement',
      description: environments.length > 0
        ? `${environments.length} environnement${environments.length > 1 ? 's' : ''} configuré${environments.length > 1 ? 's' : ''}`
        : 'Associez un VPS (STAGING ou PRODUCTION)',
      done: environments.length > 0,
      tab: 'environments',
      icon: <Server size={14} />,
    },
    {
      id: 'build',
      label: 'Builder l\'application',
      description: 'Générer Dockerfile + pipeline GitLab CI',
      done: !!lastDeployment,
      tab: 'build',
      icon: <Wrench size={14} />,
    },
    {
      id: 'deploy',
      label: 'Premier déploiement',
      description: lastDeployment
        ? `Dernier : ${lastDeployment.status} · ${timeAgo(lastDeployment.createdAt)}`
        : 'Lancez votre premier déploiement',
      done: !!lastDeployment && lastDeployment.status === 'SUCCESS',
      tab: 'deployments',
      icon: <Rocket size={14} />,
    },
  ];

  const allDone = steps.every((s) => s.done);
  const nextStep = steps.find((s) => !s.done);

  return (
    <div className="space-y-4">

      {/* Getting Started checklist — shown until everything is done */}
      {!allDone && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <div className="mb-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Pour commencer</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Suivez ces étapes pour déployer votre première application.</p>
          </div>

          <div className="space-y-2">
            {steps.map((step, i) => {
              const isNext = step.id === nextStep?.id;
              const isLocked = !step.done && !isNext;
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${
                    step.done
                      ? 'border-green-500/20 bg-green-500/5'
                      : isNext
                        ? 'border-[var(--text-primary)]/30 bg-[var(--hover)]'
                        : 'border-[var(--border)] opacity-50'
                  }`}
                >
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                    step.done
                      ? 'border-green-500/40 bg-green-500/10 text-green-400'
                      : isNext
                        ? 'border-[var(--text-primary)]/50 bg-[var(--text-primary)]/10 text-[var(--text-primary)]'
                        : 'border-[var(--border)] text-[var(--text-muted)]'
                  }`}>
                    {step.done ? <CheckCircle2 size={14} /> : isLocked ? <Circle size={14} /> : step.icon}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${step.done ? 'text-green-400' : 'text-[var(--text-primary)]'}`}>
                      {i + 1}. {step.label}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">{step.description}</p>
                  </div>

                  {isNext && step.tab && (
                    <button
                      type="button"
                      onClick={() => {
                        if (step.id === 'build' && onOpenBuild) {
                          onOpenBuild();
                        } else if (onTabChange) {
                          onTabChange(step.tab!);
                        }
                      }}
                      className="shrink-0 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90"
                    >
                      Configurer →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            <Users size={12} /> Members
          </p>
          <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{project.members.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            <GitBranch size={12} /> Branche par défaut
          </p>
          <p className="mt-2 text-2xl font-bold font-mono text-[var(--text-primary)]">{project.branch ?? '—'}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Environnements</p>
          <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{environments.length}</p>
        </div>
      </div>

      {/* Last deployment */}
      {lastDeployment ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Dernier déploiement</p>
              <div className="mt-2 flex items-center gap-2">
                <DeploymentStatusBadge status={lastDeployment.status} size="sm" />
                <span className="text-sm font-semibold text-[var(--text-primary)]">{lastDeployment.environment.name}</span>
                <span className="font-mono text-xs text-[var(--text-muted)]">@ {lastDeployment.branch}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {lastDeployment.user.fullName} · {timeAgo(lastDeployment.createdAt)}
              </p>
              {rollbackError && <p className="mt-2 text-xs text-red-400">{rollbackError}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/deployments/${lastDeployment.id}`}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                <ExternalLink size={12} /> Logs
              </Link>
              {canRollback && (
                <button
                  type="button"
                  onClick={() => void handleRollback()}
                  disabled={rollingBack}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400 transition hover:bg-amber-500/20 disabled:opacity-50"
                >
                  {rollingBack ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                  Rollback
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-10 text-center">
          <Rocket size={24} className="mb-3 text-[var(--text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">Aucun déploiement</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Complétez les étapes ci-dessus pour lancer votre premier déploiement.
          </p>
        </div>
      )}
    </div>
  );
}
