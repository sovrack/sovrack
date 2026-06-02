import Link from 'next/link';
import { ExternalLink, Globe, Loader2 } from 'lucide-react';
import type { Deployment } from '@/types/deployment';

const STATUS_STYLE: Record<string, string> = {
  SUCCESS: 'text-green-400 bg-green-500/10 border-green-500/20',
  RUNNING: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  FAILED: 'text-red-400 bg-red-500/10 border-red-500/20',
  CANCELED: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
  PENDING: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
};

const ENV_STYLE: Record<string, string> = {
  PRODUCTION: 'text-green-400',
  STAGING: 'text-blue-400',
  TESTING: 'text-amber-400',
  PREVIEW: 'text-purple-400',
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function resolvePublicUrl(deployment: Deployment): string | null {
  if (deployment.publicUrl) return deployment.publicUrl;
  const serviceId = deployment.serviceId;
  const targets = deployment.environment?.serviceTargets ?? [];
  const target = serviceId
    ? targets.find((t) => t.serviceId === serviceId)
    : targets[0] ?? null;
  const server = target?.server ?? deployment.environment?.server ?? null;
  if (!server) return null;
  if (target?.domain) return `http://${target.domain}`;
  if (target?.port) return `http://${server.host}:${String(target.port)}`;
  return null;
}

type Props = {
  deployments: Deployment[];
  loading: boolean;
  error: string | null;
  projectId: string;
};

export function ProjectDeploymentsTab({ deployments, loading, error, projectId }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">{deployments.length} deployment(s)</p>
        <Link
          href="/deployments?dialog=create-deployment"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
        >
          New deployment
        </Link>
      </div>

      {loading && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {!loading && !error && deployments.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-secondary)]">
          No deployments found for this project.
        </div>
      )}

      {deployments.slice(0, 10).map((deployment) => {
        const publicUrl = resolvePublicUrl(deployment);
        return (
          <div key={deployment.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[deployment.status] ?? STATUS_STYLE.PENDING}`}>
                    {deployment.status}
                  </span>
                  <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">
                    {deployment.branch}
                  </span>
                  {deployment.environment && (
                    <span className={`text-xs font-medium ${ENV_STYLE[deployment.environment.name] ?? 'text-zinc-400'}`}>
                      {deployment.environment.name}
                    </span>
                  )}
                  {deployment.service && (
                    <span className="rounded bg-[var(--hover)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
                      {deployment.service.name}
                    </span>
                  )}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                  {deployment.environment?.server && (
                    <span>{deployment.environment.server.name} ({deployment.environment.server.host})</span>
                  )}
                  {deployment.startedAt && <span>Started {formatDate(deployment.startedAt)}</span>}
                  {deployment.finishedAt && <span>Finished {formatDate(deployment.finishedAt)}</span>}
                  {!deployment.startedAt && <span>Created {formatDate(deployment.createdAt)}</span>}
                </div>

                {publicUrl && deployment.status === 'SUCCESS' && (
                  <div className="mt-2 flex items-center gap-2">
                    <Globe size={13} className="text-green-400" />
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-green-400 underline hover:text-green-300"
                    >
                      {publicUrl}
                    </a>
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-semibold text-green-400 transition hover:bg-green-500/20"
                    >
                      Open App
                    </a>
                  </div>
                )}

                {deployment.dockerImage && (
                  <p className="mt-1 font-mono text-xs text-[var(--text-secondary)] opacity-60">{deployment.dockerImage}</p>
                )}
              </div>

              <Link
                href={`/deployments/${deployment.id}`}
                className="rounded-lg border border-[var(--border)] p-2 text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                <ExternalLink size={14} />
              </Link>
            </div>
          </div>
        );
      })}

      {deployments.length > 10 && (
        <Link
          href={`/projects/${projectId}?tab=deployments`}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--border)] py-3 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
        >
          <ExternalLink size={12} /> View all {deployments.length} deployments
        </Link>
      )}
    </div>
  );
}
