'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { projectsService } from '@/services/projects.service';
import { getApiErrorMessage } from '@/lib/api';
import type { ProjectDetail } from '@/types/project';

type ProjectConfigsTabProps = { projectId: string };

export function ProjectConfigsTab({ projectId }: ProjectConfigsTabProps) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setProject(await projectsService.getById(projectId));
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-[var(--text-muted)]" /></div>;
  }

  if (error) {
    return <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">{error}</div>;
  }

  const envVars = project?.env ? JSON.parse(project.env) : {};

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-muted)]">
        Project-level environment variables — inherited by all environments and services.
      </p>
      {Object.keys(envVars).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-12 text-center">
          <p className="text-sm font-semibold text-[var(--text-primary)]">No variables</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Edit project settings to add environment variables.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] divide-y divide-[var(--border)]">
          {Object.entries(envVars).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">{key}</span>
              <span className="font-mono text-xs text-[var(--text-secondary)] truncate max-w-xs">{String(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
