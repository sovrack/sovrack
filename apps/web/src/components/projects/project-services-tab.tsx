'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/api';
import { projectsService } from '@/services/projects.service';
import type { ProjectService } from '@/types/project';

type Props = {
  projectId: string;
};

export function ProjectServicesTab({ projectId }: Props) {
  const [services, setServices] = useState<ProjectService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    projectsService
      .getServices(projectId)
      .then((items) => {
        if (mounted) setServices(items);
      })
      .catch((err) => {
        if (mounted) setError(getApiErrorMessage(err));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-3 text-sm text-[var(--text-primary)]">
        <Loader2 size={14} className="animate-spin" /> Loading services...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-card)]/5 p-8 text-center">
        <p className="text-sm font-semibold text-[var(--text-primary)]">No services yet</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Import a GitLab group or connect repositories to create deployable services.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {services.map((service) => (
        <div key={service.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{service.name}</h3>
              <p className="mt-1 break-all text-xs text-[var(--text-secondary)]">
                {service.repositoryPath ?? 'No repository linked'}
              </p>
            </div>
            <span className="rounded-full bg-[var(--text-primary)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
              {service.type}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-[var(--text-secondary)]">
            <div>
              <p className="font-semibold uppercase tracking-wider">Branch</p>
              <p className="mt-1 font-mono text-[var(--text-primary)]">{service.defaultBranch}</p>
            </div>
            <div>
              <p className="font-semibold uppercase tracking-wider">Build</p>
              <p className="mt-1 text-[var(--text-primary)]">{service.buildStrategy}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
