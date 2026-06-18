'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  Loader2,
  Rocket,
  Settings2,
  X,
} from 'lucide-react';
import { deploymentsService } from '@/services/deployments.service';
import { environmentsService } from '@/services/environments.service';
import { projectsService } from '@/services/projects.service';
import { getApiErrorMessage } from '@/lib/api';
import type { Environment } from '@/types/environment';
import type { GitlabBranch, ProjectDetail } from '@/types/project';
import type { BuildSource } from '@/types/deployment';

type Props = {
  projectId: string;
  project?: ProjectDetail | null;
  defaultBuildSource?: string | null;
  onClose: () => void;
  onCreated?: (deploymentId: string) => void;
};

const BUILD_SOURCES: { value: BuildSource; label: string }[] = [
  { value: 'DOCKERFILE_LOCAL', label: 'Dockerfile (Local)' },
  { value: 'DOCKERFILE_REGISTRY', label: 'Dockerfile (Registry)' },
  { value: 'NIXPACKS_LOCAL', label: 'Nixpacks (Local)' },
  { value: 'NIXPACKS_REGISTRY', label: 'Nixpacks (Registry)' },
  { value: 'DOCKER_COMPOSE', label: 'Docker Compose' },
  { value: 'STATIC', label: 'Static Site' },
  { value: 'EXTERNAL_IMAGE', label: 'External Image' },
];

export function DeployPopover({ projectId, project, defaultBuildSource, onClose, onCreated }: Props) {
  const router = useRouter();
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [branches, setBranches] = useState<GitlabBranch[]>([]);
  const [envId, setEnvId] = useState('');
  const [branch, setBranch] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [buildSource, setBuildSource] = useState<BuildSource>(
    (defaultBuildSource as BuildSource) ?? 'DOCKERFILE_LOCAL',
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      environmentsService.getAll(projectId),
      projectsService.getBranches(projectId).catch(() => [] as GitlabBranch[]),
    ])
      .then(([envs, brs]) => {
        if (cancelled) return;
        setEnvironments(envs);
        setBranches(brs);
        if (envs.length > 0) setEnvId(envs[0].id);
        const def = brs.find((b) => b.default);
        if (def) setBranch(def.name);
        else if (brs.length > 0) setBranch(brs[0].name);
        else setBranch(project?.branch ?? 'main');
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, project?.branch]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!envId) { setError('Select an environment.'); return; }
    setSubmitting(true); setError(null);
    try {
      const dep = await deploymentsService.create({
        projectId,
        environmentId: envId,
        branch: branch || undefined,
        buildSource,
      });
      onClose();
      if (onCreated) onCreated(dep.id);
      else router.push(`/deployments/${dep.id}`);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={ref} className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <p className="text-xs font-semibold text-[var(--text-primary)]">Deploy</p>
        <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-3 p-4">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-[var(--text-muted)]" /></div>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Environment</label>
              {environments.length === 0 ? (
                <p className="text-xs text-amber-400">No environments configured.</p>
              ) : (
                <select
                  value={envId}
                  onChange={(e) => setEnvId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none"
                >
                  {environments.map((env) => (
                    <option key={env.id} value={env.id}>{env.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Branch</label>
              {branches.length > 0 ? (
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none"
                >
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>{b.name}{b.default ? ' (default)' : ''}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none"
                />
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setAdvanced((v) => !v)}
                className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <Settings2 size={10} /> {advanced ? 'Hide' : 'Override'} build source <ChevronDown size={10} className={advanced ? 'rotate-180' : ''} />
              </button>
              {advanced && (
                <select
                  value={buildSource}
                  onChange={(e) => setBuildSource(e.target.value as BuildSource)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none"
                >
                  {BUILD_SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting || !envId}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-40"
        >
          {submitting ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />}
          Deploy
        </button>
      </div>
    </div>
  );
}
