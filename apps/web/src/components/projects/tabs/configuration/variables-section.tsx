'use client';

import { useEffect, useRef, useState } from 'react';
import { Info, KeyRound, Loader2, Server } from 'lucide-react';
import clsx from 'clsx';
import { EnvConfigsPanel } from '@/components/projects/env-configs-panel';
import { ProjectConfigsTab } from '@/components/projects/project-configs-tab';
import { environmentsService } from '@/services/environments.service';
import { getApiErrorMessage } from '@/lib/api';
import type { Environment } from '@/types/environment';

const ENV_BADGE_CFG: Record<string, string> = {
  PRODUCTION: 'border-red-500/30 bg-red-500/10 text-red-400',
  STAGING:    'border-blue-500/30 bg-blue-500/10 text-blue-400',
  TESTING:    'border-amber-500/30 bg-amber-500/10 text-amber-400',
  PREVIEW:    'border-purple-500/30 bg-purple-500/10 text-purple-400',
};

function PerEnvVariablesSection({ projectId }: { projectId: string }) {
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true); setError(null);
    environmentsService.getAll(projectId)
      .then((list) => { if (mountedRef.current) { setEnvs(list); if (list.length > 0) setSelectedEnvId(list[0].id); } })
      .catch((err) => { if (mountedRef.current) setError(getApiErrorMessage(err)); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
    return () => { mountedRef.current = false; };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-muted)]">
      <Loader2 size={13} className="animate-spin" /> Loading environments…
    </div>
  );

  if (error) return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-400">
      Failed to load environments: {error}
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
            <span className="font-mono text-[10px] text-[var(--text-muted)]">Host details available in Servers</span>
          </div>
          <div className="p-4">
            <EnvConfigsPanel projectId={projectId} environmentId={selectedEnvId} onClose={() => {}} />
          </div>
        </div>
      )}
    </div>
  );
}

export function VariablesPanelWithTabs({ projectId }: { projectId: string }) {
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
