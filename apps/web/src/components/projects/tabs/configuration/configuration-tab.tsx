'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle, Box, GitBranch, Globe, KeyRound, Layers, Rocket, Zap,
} from 'lucide-react';
import clsx from 'clsx';
import type { UseProjectSourceReturn } from '@/hooks/projects/use-project-source';
import type { ProjectDetail } from '@/types/project';
import type { Service } from '@/types/service';
import { buildService } from '@/services/build.service';
import { ProjectEnvironmentsTab } from '@/components/projects/project-environments-tab';
import type { BuildStatusResult } from '@/services/build.service';
import { SourceSection, WebhooksSection } from './source-section';
import { BuildSection } from './build-section';
import { DomainsConfigSection } from './domains-section';
import { VariablesPanelWithTabs } from './variables-section';
import { ServiceAssignmentSection } from './service-assignment-section';

type ConfigurationTabProps = {
  projectId: string;
  project?: ProjectDetail | null;
  isAdmin: boolean;
  isOwner: boolean;
  sourceType?: string | null;
  hasEnvironment?: boolean;
  source: UseProjectSourceReturn;
  scope?: 'application' | 'environments';
  onDeploy?: () => void;
  onDeployService?: (serviceId: string) => void;
  onOpenSourceSetupDialog: () => void;
};

const SCOPE_GROUP_FILTER: Record<string, string[]> = {
  application: ['Application'],
  environments: ['Environnements', 'Automatisation'],
};

const SIDEBAR_GROUPS: {
  group: string;
  items: { id: string; label: string; icon: React.ReactNode; subtitle: string }[];
}[] = [
  {
    group: 'Application',
    items: [
      { id: 'source', label: 'Source',  icon: <GitBranch size={16} />, subtitle: 'Git repository (group/project path)' },
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
  source, scope, onDeploy, onDeployService, onOpenSourceSetupDialog,
}: ConfigurationTabProps) {
  const filteredGroups = scope
    ? SIDEBAR_GROUPS.filter((g) => (SCOPE_GROUP_FILTER[scope] ?? []).includes(g.group))
    : SIDEBAR_GROUPS;
  const firstSection = filteredGroups.flatMap((g) => g.items.map((i) => i.id))[0] ?? 'source';
  const [activeSection, setActiveSection] = useState(firstSection);
  const [buildStatus, setBuildStatus]   = useState<BuildStatusResult | null>(null);
  const [buildStatusLoading, setBuildStatusLoading] = useState(false);

  const projectEnv = useMemo(() => {
    try { return project?.env ? JSON.parse(project.env) : {}; } catch { return {}; }
  }, [project?.env]);

  const projectServices: Service[] = useMemo(() => projectEnv.services ?? [], [projectEnv]);

  const refreshBuildStatus = useCallback(() => {
    setBuildStatusLoading(true);
    buildService.getBuildStatus(projectId).then(setBuildStatus).catch(() => {
      setBuildStatus(null);
    }).finally(() => setBuildStatusLoading(false));
  }, [projectId]);

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
              <SourceSection source={source} isOwner={isOwner} onOpenSourceSetupDialog={onOpenSourceSetupDialog} services={projectServices} />
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
                services={projectServices}
                buildStatus={buildStatus} buildStatusLoading={buildStatusLoading} onRefreshBuildStatus={refreshBuildStatus}
                initialDefaultBuildSource={projectEnv.defaultBuildSource}
                initialPort={projectEnv.buildPort}
                initialStartCmd={projectEnv.buildStartCmd}
                initialProjType={projectEnv.projectType ?? undefined}
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
              <WebhooksSection source={source} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
