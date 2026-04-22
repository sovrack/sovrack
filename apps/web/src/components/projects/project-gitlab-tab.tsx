import {
  ArrowRight,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { UseProjectGitlabReturn } from '@/hooks/useProjectGitlab';
import { Button } from '@/components/ui/button';

type ProjectGitlabTabProps = {
  isOwner: boolean;
  gitlab: UseProjectGitlabReturn;
  onOpenSourceSetupDialog: () => void;
};

export function ProjectGitlabTab({
  isOwner,
  gitlab,
  onOpenSourceSetupDialog,
}: ProjectGitlabTabProps) {
  const isGitlabConnected = Boolean(gitlab.gitlabConfig);
  const activeProvider = gitlab.providers.find(
    (provider) =>
      provider.id ===
      (gitlab.gitlabConfig?.providerId ?? gitlab.providerId ?? ''),
  );

  return (
    <div className="space-y-4">
      {gitlab.gitlabError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {gitlab.gitlabError}
        </div>
      )}

      {!isGitlabConnected && isOwner && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Source Not Connected</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Configure GitLab source and optional registry credentials in the setup dialog.
          </p>
          <Button
            type="button"
            className="mt-4"
            onClick={onOpenSourceSetupDialog}
            icon={<ArrowRight size={14} />}
          >
            Configure source
          </Button>
        </div>
      )}

      {!isGitlabConnected && !isOwner && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] py-12 text-center">
          <GitBranch size={32} className="mx-auto text-[var(--text-primary)]" />
          <p className="mt-3 text-sm font-medium text-[var(--text-secondary)]">No GitLab source connected</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Only owner or admin can configure GitLab.
          </p>
        </div>
      )}

      {isGitlabConnected && gitlab.gitlabConfig && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">GitLab Configuration</h3>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Source type: {gitlab.gitlabConfig.sourceType}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isOwner && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onOpenSourceSetupDialog}
                >
                  Edit source
                </Button>
              )}
              <button
                type="button"
                onClick={() => void gitlab.loadGitlabData()}
                disabled={gitlab.gitlabLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-card)]/10 disabled:opacity-50"
              >
                <RefreshCw size={15} className={gitlab.gitlabLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                Repository URL
              </p>
              <a
                href={gitlab.gitlabConfig.gitlabUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 break-all text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
              >
                {gitlab.gitlabConfig.gitlabUrl}
                <ExternalLink size={14} />
              </a>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                Provider:{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  {activeProvider?.name ??
                    (gitlab.gitlabConfig?.providerId
                      ? gitlab.gitlabConfig.providerId
                      : 'Default')}
                </span>
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                Source
              </p>
              <p className="mt-2 font-mono text-lg font-semibold text-[var(--text-primary)]">
                {gitlab.gitlabConfig.sourceType}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {gitlab.gitlabConfig.sourceType === 'REPO'
                  ? `Project ID: ${gitlab.gitlabConfig.gitlabId ?? '-'}`
                  : `Group ID: ${gitlab.gitlabConfig.gitlabGroupId ?? '-'}`}
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                Webhook Security
              </p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Le secret webhook n’est jamais exposé côté UI.
              </p>
              <span className="mt-3 inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-card)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)]">
                {gitlab.gitlabConfig.webhookSecretConfigured
                  ? 'Secret configured'
                  : 'Secret not configured'}
              </span>
            </div>
          </div>

          {gitlab.gitlabConfig.sourceType === 'GROUP' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--text-primary)]/10 px-4 py-3 text-sm text-[var(--text-secondary)]">
                Ce projet est connecté à un groupe GitLab. Sélectionnez un repository lors du déploiement.
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[var(--text-primary)]">Group Repositories</h4>
                  <span className="rounded-full bg-[var(--bg-card)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)]">
                    {gitlab.repos.length} repos
                  </span>
                </div>
                <div className="space-y-2">
                  {gitlab.repos.length === 0 && (
                    <p className="text-sm text-[var(--text-secondary)]">No repositories found in this group.</p>
                  )}
                  {gitlab.repos.slice(0, 10).map((repo) => (
                    <div
                      key={repo.id}
                      className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{repo.name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{repo.path_with_namespace ?? ''}</p>
                      </div>
                      {repo.web_url && (
                        <a
                          href={repo.web_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
                        >
                          Open
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[var(--text-primary)]">Branches</h4>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      Select a branch and trigger a pipeline.
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--bg-card)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)]">
                    {gitlab.branches.length} branches
                  </span>
                </div>

                {gitlab.branches.length > 0 ? (
                  <>
                    <select
                      value={gitlab.selectedBranch}
                      onChange={(event) => gitlab.setSelectedBranch(event.target.value)}
                      className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:bg-[var(--bg-card)]/10 focus:ring-2 focus:ring-zinc-500/20"
                    >
                      {gitlab.branches.map((branch) => (
                        <option key={branch.name} value={branch.name}>
                          {branch.name}
                          {branch.default ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>

                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => void gitlab.handleTriggerPipeline()}
                        disabled={gitlab.pipelineSubmitting || !gitlab.selectedBranch}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--bg-card)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] transition hover:bg-[var(--bg-card)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {gitlab.pipelineSubmitting && (
                          <Loader2 size={15} className="animate-spin" />
                        )}
                        Trigger Pipeline
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">No branches available yet.</p>
                )}
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[var(--text-primary)]">Recent Pipelines</h4>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      Latest GitLab pipeline activity for this project.
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--bg-card)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)]">
                    {gitlab.pipelines.length} entries
                  </span>
                </div>

                <div className="space-y-3">
                  {gitlab.pipelines.length === 0 && (
                    <p className="text-sm text-[var(--text-secondary)]">No pipelines found for this project yet.</p>
                  )}
                  {gitlab.pipelines.slice(0, 6).map((pipeline) => (
                    <div
                      key={pipeline.id}
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">#{pipeline.id}</p>
                          <p className="mt-0.5 font-mono text-xs text-[var(--text-secondary)]">{pipeline.ref}</p>
                        </div>
                        <span className="rounded-full bg-[var(--bg-card)]/10 px-2.5 py-1 text-[11px] font-semibold uppercase text-[var(--text-primary)]">
                          {pipeline.status}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
                        <span className="font-mono">{pipeline.sha.slice(0, 8)}</span>
                        {pipeline.web_url && (
                          <a
                            href={pipeline.web_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
                          >
                            Open
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
