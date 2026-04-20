import {
  Copy,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { UseProjectGitlabReturn } from '@/hooks/useProjectGitlab';

type ProjectGitlabTabProps = {
  isOwner: boolean;
  gitlab: UseProjectGitlabReturn;
};

export function ProjectGitlabTab({ isOwner, gitlab }: ProjectGitlabTabProps) {
  const isGitlabConnected = Boolean(gitlab.gitlabConfig);

  return (
    <div className="space-y-4">
      {gitlab.gitlabError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {gitlab.gitlabError}
        </div>
      )}

      {!isGitlabConnected && isOwner && (
        <form
          onSubmit={(event) => void gitlab.handleConnectGitlab(event)}
          className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
        >
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-slate-900">Connect GitLab</h3>
            <p className="mt-1 text-xs text-slate-400">
              Configure REPO ou GROUP, puis les credentials optionnels du registry.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                Source Type
              </label>
              <select
                value={gitlab.sourceType}
                onChange={(event) =>
                  gitlab.setSourceType(event.target.value === 'GROUP' ? 'GROUP' : 'REPO')
                }
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              >
                <option value="REPO">REPO</option>
                <option value="GROUP">GROUP</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                GitLab URL
              </label>
              <input
                type="url"
                required
                value={gitlab.gitlabUrl}
                onChange={(event) => gitlab.setGitlabUrl(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {gitlab.sourceType === 'REPO' ? (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                  Project ID
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={gitlab.gitlabProjectId}
                  onChange={(event) => gitlab.setGitlabProjectId(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                  Group ID
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={gitlab.gitlabGroupId}
                  onChange={(event) => gitlab.setGitlabGroupId(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                Default Branch
              </label>
              <input
                type="text"
                value={gitlab.defaultBranch}
                onChange={(event) => gitlab.setDefaultBranch(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                Access Token
              </label>
              <input
                type="password"
                required
                value={gitlab.gitlabToken}
                onChange={(event) => gitlab.setGitlabToken(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                Deploy Token Username
              </label>
              <input
                type="text"
                value={gitlab.deployTokenUsername}
                onChange={(event) => gitlab.setDeployTokenUsername(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                Deploy Token Value
              </label>
              <input
                type="password"
                value={gitlab.deployTokenValue}
                onChange={(event) => gitlab.setDeployTokenValue(event.target.value)}
                placeholder="***"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                Registry URL
              </label>
              <input
                type="text"
                value={gitlab.registryUrl}
                onChange={(event) => gitlab.setRegistryUrl(event.target.value)}
                placeholder="registry.gitlab.example.com"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={gitlab.gitlabSubmitting}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {gitlab.gitlabSubmitting && <Loader2 size={15} className="animate-spin" />}
            Save GitLab Configuration
          </button>
        </form>
      )}

      {!isGitlabConnected && !isOwner && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center">
          <GitBranch size={32} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-500">No GitLab source connected</p>
          <p className="mt-1 text-xs text-slate-400">
            Only owner or admin can configure GitLab.
          </p>
        </div>
      )}

      {isGitlabConnected && gitlab.gitlabConfig && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">GitLab Configuration</h3>
              <p className="mt-1 text-xs text-slate-400">
                Source type: {gitlab.gitlabConfig.sourceType}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void gitlab.loadGitlabData()}
              disabled={gitlab.gitlabLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={15} className={gitlab.gitlabLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Repository URL
              </p>
              <a
                href={gitlab.gitlabConfig.gitlabUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 break-all text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                {gitlab.gitlabConfig.gitlabUrl}
                <ExternalLink size={14} />
              </a>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Source
              </p>
              <p className="mt-2 font-mono text-lg font-semibold text-slate-900">
                {gitlab.gitlabConfig.sourceType}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {gitlab.gitlabConfig.sourceType === 'REPO'
                  ? `Project ID: ${gitlab.gitlabConfig.gitlabId ?? '-'}`
                  : `Group ID: ${gitlab.gitlabConfig.gitlabGroupId ?? '-'}`}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Webhook Secret
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={gitlab.gitlabConfig.webhookSecret ?? ''}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-700"
                />
                <button
                  type="button"
                  onClick={() => void gitlab.handleCopyWebhookSecret()}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <Copy size={14} />
                </button>
              </div>
              {gitlab.copySuccess && (
                <p className="mt-1 text-xs font-medium text-emerald-600">
                  Webhook secret copied
                </p>
              )}
            </div>
          </div>

          {gitlab.gitlabConfig.sourceType === 'GROUP' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                Ce projet est connecté à un groupe GitLab. Sélectionnez un repository lors du déploiement.
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900">Group Repositories</h4>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {gitlab.repos.length} repos
                  </span>
                </div>
                <div className="space-y-2">
                  {gitlab.repos.length === 0 && (
                    <p className="text-sm text-slate-500">No repositories found in this group.</p>
                  )}
                  {gitlab.repos.slice(0, 10).map((repo) => (
                    <div
                      key={repo.id}
                      className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{repo.name}</p>
                        <p className="text-xs text-slate-500">{repo.path_with_namespace ?? ''}</p>
                      </div>
                      {repo.web_url && (
                        <a
                          href={repo.web_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
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
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Branches</h4>
                    <p className="mt-1 text-xs text-slate-400">
                      Select a branch and trigger a pipeline.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {gitlab.branches.length} branches
                  </span>
                </div>

                {gitlab.branches.length > 0 ? (
                  <>
                    <select
                      value={gitlab.selectedBranch}
                      onChange={(event) => gitlab.setSelectedBranch(event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
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
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {gitlab.pipelineSubmitting && (
                          <Loader2 size={15} className="animate-spin" />
                        )}
                        Trigger Pipeline
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-500">No branches available yet.</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Recent Pipelines</h4>
                    <p className="mt-1 text-xs text-slate-400">
                      Latest GitLab pipeline activity for this project.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {gitlab.pipelines.length} entries
                  </span>
                </div>

                <div className="space-y-3">
                  {gitlab.pipelines.length === 0 && (
                    <p className="text-sm text-slate-500">No pipelines found for this project yet.</p>
                  )}
                  {gitlab.pipelines.slice(0, 6).map((pipeline) => (
                    <div
                      key={pipeline.id}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">#{pipeline.id}</p>
                          <p className="mt-0.5 font-mono text-xs text-slate-500">{pipeline.ref}</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase text-slate-600">
                          {pipeline.status}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                        <span className="font-mono">{pipeline.sha.slice(0, 8)}</span>
                        {pipeline.web_url && (
                          <a
                            href={pipeline.web_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
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
