'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, GitBranch, Loader2, RefreshCw } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/api';
import { projectsService } from '@/services/projects.service';
import type { GitlabConfig, GitlabPipeline, ProjectService } from '@/types/project';

type Props = {
  projectId: string;
  gitlabConfig?: GitlabConfig | null;
};

function statusColor(status: string) {
  if (status === 'success') return 'text-green-400 bg-green-500/10 border-green-500/20';
  if (status === 'failed') return 'text-red-400 bg-red-500/10 border-red-500/20';
  if (status === 'running') return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
  if (status === 'canceled') return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
  return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
}


function PipelineList({ pipelines, loading, error }: { pipelines: GitlabPipeline[]; loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-[var(--text-secondary)]">
        <Loader2 size={12} className="animate-spin" /> Chargement…
      </div>
    );
  }
  if (error) {
    return <p className="text-xs text-red-400">{error}</p>;
  }
  if (pipelines.length === 0) {
    return <p className="text-xs text-[var(--text-muted)]">Aucun pipeline trouvé.</p>;
  }
  return (
    <div className="mt-2 space-y-1.5">
      {pipelines.slice(0, 10).map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--hover)] px-3 py-2">
          <div className="min-w-0">
            <span className="font-mono text-xs text-[var(--text-primary)]">#{p.id}</span>
            <span className="ml-2 text-xs text-[var(--text-secondary)]">{p.ref} · {p.sha?.slice(0, 8)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusColor(p.status)}`}>
              {p.status}
            </span>
            {p.web_url && (
              <a href={p.web_url} target="_blank" rel="noreferrer" className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ServicePipelineCard({ projectId, service }: { projectId: string; service: ProjectService }) {
  const [pipelines, setPipelines] = useState<GitlabPipeline[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const serviceReady = Boolean(service.gitlabProjectId && service.defaultBranch);

  const load = () => {
    if (!serviceReady) {
      setError('Service incomplet: GitLab project ID ou branche manquants.');
      setPipelines([]);
      return;
    }
    setLoading(true);
    setError(null);
    projectsService.getServicePipelines(projectId, service.id)
      .then(setPipelines)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--hover)]">
            <GitBranch size={14} className="text-[var(--text-secondary)]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{service.name}</p>
            <p className="text-xs text-[var(--text-muted)]">
              {service.type}
              {service.repositoryPath && ` · ${service.repositoryPath}`}
              {service.defaultBranch && ` · ${service.defaultBranch}`}
            </p>
            <p className="text-xs text-[var(--text-muted)] font-mono">
              GitLab ID: {service.gitlabProjectId ? String(service.gitlabProjectId) : 'missing'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!expanded) load();
              setExpanded((v) => !v);
            }}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            disabled={!serviceReady}
          >
            {expanded ? 'Masquer' : 'Pipelines'}
          </button>
          {expanded && (
            <button type="button" onClick={load} disabled={!serviceReady} className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50">
              <RefreshCw size={12} />
            </button>
          )}
        </div>
      </div>
      {!serviceReady && (
        <p className="mt-2 text-xs text-amber-300">
          Service non prêt: GitLab project ID ou branche manquants.
        </p>
      )}
      {expanded && (
        <PipelineList pipelines={pipelines} loading={loading} error={error} />
      )}
    </div>
  );
}

export function ProjectPipelinesTab({ projectId, gitlabConfig }: Props) {
  const [pipelines, setPipelines] = useState<GitlabPipeline[]>([]);
  const [services, setServices] = useState<ProjectService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isGroupSource = gitlabConfig?.sourceType === 'GROUP';

  const load = () => {
    setLoading(true);
    setError(null);

    if (isGroupSource) {
      projectsService
        .getServices(projectId)
        .then((svcs) => setServices(svcs))
        .catch((err) => setError(getApiErrorMessage(err)))
        .finally(() => setLoading(false));
      return;
    }

    projectsService
      .getPipelines(projectId)
      .then((items) => setPipelines(items))
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isGroupSource]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        <Loader2 size={14} className="animate-spin" /> Chargement des pipelines…
      </div>
    );
  }

  /* GROUP source — per-service cards with expandable pipeline lists */
  if (isGroupSource) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--text-secondary)]">
            Source type: <span className="font-semibold text-[var(--text-primary)]">Group</span> — pipelines par service.
          </p>
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
        )}

        {services.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-secondary)]">
            Aucun service trouvé. Ajoutez des services dans l&apos;onglet <strong>Services</strong>.
          </div>
        ) : (
          services.map((service) => (
            <ServicePipelineCard key={service.id} projectId={projectId} service={service} />
          ))
        )}
      </div>
    );
  }

  /* REPO source — global pipeline list */
  if (error) {
    return (
      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">{pipelines.length} pipeline(s) trouvé(s)</p>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {pipelines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-secondary)]">
          Aucun pipeline GitLab trouvé pour cette source.
        </div>
      ) : (
        <PipelineList pipelines={pipelines} loading={false} error={null} />
      )}
    </div>
  );
}
