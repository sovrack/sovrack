'use client';

import { X, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePreparationReadiness, useServerPreparationOptions } from '@/hooks/servers/use-servers';
import type { Server, ServerInstalledTool, StartServerPreparationPayload } from '@/types/server';

export type PrepareOptions = StartServerPreparationPayload;

type OptionGroup = 'Core' | 'Runtime' | 'Security' | 'Operations';

type ServerPrepareDialogProps = {
  open: boolean;
  server: Server | null;
  prepareOptions: PrepareOptions;
  isBusy: boolean;
  preparingId: string | null;
  installedTools?: ServerInstalledTool[];
  onClose: () => void;
  onFieldChange: (
    server: Server,
    field: keyof PrepareOptions,
    value: boolean | string,
  ) => void;
  onPrepare: (server: Server) => Promise<void>;
};

function resolveGroup(role: string | null): OptionGroup {
  if (!role || role === 'system_base') return 'Core';
  if (['docker', 'nginx', 'nodejs', 'postgres', 'redis', 'gitlab_runner'].includes(role)) {
    return 'Runtime';
  }
  if (['firewall', 'fail2ban', 'ssl', 'security_hardening'].includes(role)) {
    return 'Security';
  }
  return 'Operations';
}

export function ServerPrepareDialog({
  open,
  server,
  prepareOptions,
  isBusy,
  preparingId,
  onClose,
  onFieldChange,
  onPrepare,
}: ServerPrepareDialogProps) {
  const readinessQuery = usePreparationReadiness(
    open && server ? server.id : '',
  );
  const optionsQuery = useServerPreparationOptions();

  if (!open || !server) return null;

  const readiness = readinessQuery.data;
  const readinessLoading = readinessQuery.isLoading || readinessQuery.isFetching;
  const readinessError = readinessQuery.error
    ? 'Impossible de vérifier les prérequis de préparation pour le moment.'
    : null;
  const blockingReasons = readinessLoading
    ? ['Checking preparation prerequisites...']
    : readinessError
      ? [readinessError]
      : (readiness?.blockingReasons ?? []);
  const isReady =
    !readinessLoading && !readinessError && Boolean(readiness?.isReady);

  const profiles = optionsQuery.data?.profiles ?? [];
  const options = optionsQuery.data?.options ?? [];
  const profile = prepareOptions.profile ?? 'BASIC';
  const profileDefaultsForSelection =
    optionsQuery.data?.profileDefaults?.[profile] ?? {};
  const gitlabRunnerExecutor = prepareOptions.gitlabRunnerExecutor ?? 'docker';
  const isOptionEnabled = (optionKey: string): boolean => {
    const explicit = prepareOptions[optionKey as keyof PrepareOptions];
    if (typeof explicit === 'boolean') {
      return explicit;
    }
    return Boolean(
      profileDefaultsForSelection[
        optionKey as keyof typeof profileDefaultsForSelection
      ],
    );
  };
  const hasSelection = options.some((option) => isOptionEnabled(option.key));
  const groups: OptionGroup[] = ['Core', 'Runtime', 'Security', 'Operations'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />

      <div className="relative z-10 max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
              Prepare Server
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
              Choose preparation options
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {server.username}@{server.host}:{server.port}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
            {optionsQuery.data?.message ??
              'Ansible runs from the backend control node. The target VPS remains an agentless SSH host and does not install Ansible.'}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
                Profile
              </label>
              <select
                value={profile}
                onChange={(event) =>
                  onFieldChange(
                    server,
                    'profile',
                    event.target.value,
                  )
                }
                disabled={isBusy}
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20"
              >
                {profiles.length === 0 && (
                  <option value={profile}>{profile}</option>
                )}
                {profiles.map((profileItem) => (
                  <option key={profileItem} value={profileItem}>
                    {profileItem}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3 text-xs text-[var(--text-secondary)]">
              <p className="font-semibold text-[var(--text-primary)]">
                Control-node execution
              </p>
              <p className="mt-1">
                All playbooks run from backend/control node. VPS are only SSH targets.
              </p>
            </div>
          </div>

          {optionsQuery.isLoading && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--hover)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              Loading preparation options...
            </div>
          )}

          {optionsQuery.error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              Unable to load preparation options from backend.
            </div>
          )}

          {groups.map((group) => {
            const groupOptions = options.filter(
              (option) => resolveGroup(option.role) === group,
            );
            if (groupOptions.length === 0) {
              return null;
            }
            return (
              <section key={group} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{group}</h3>
                  <Badge tone="default" size="sm">
                    {groupOptions.length} options
                  </Badge>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {groupOptions.map((option) => {
                    const checked = isOptionEnabled(option.key);
                    return (
                      <label
                        key={option.key}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3 transition hover:border-[var(--text-secondary)] hover:bg-[var(--bg-card)]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            onFieldChange(
                              server,
                              option.key as keyof PrepareOptions,
                              event.target.checked,
                            )
                          }
                          disabled={isBusy}
                          className="mt-1 accent-zinc-500"
                        />
                        <div className="flex-1">
                          <span className="text-sm font-semibold text-[var(--text-primary)]">
                            {option.label}
                          </span>
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">
                            {option.description}
                          </p>
                          {option.dependencies.length > 0 && (
                            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                              Depends on: {option.dependencies.join(', ')}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {Boolean(prepareOptions.gitlabRunner) && (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
                GitLab Runner executor
              </label>
              <select
                value={gitlabRunnerExecutor}
                onChange={(event) =>
                  onFieldChange(
                    server,
                    'gitlabRunnerExecutor',
                    event.target.value,
                  )
                }
                disabled={isBusy}
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20"
              >
                <option value="docker">docker</option>
                <option value="shell">shell</option>
              </select>
            </div>
          )}

          {!hasSelection && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
              Select at least one preparation option.
            </div>
          )}

          {!isReady && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <p className="font-semibold">Preparation blocked</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {blockingReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-card)] px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isBusy}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void onPrepare(server)}
            disabled={isBusy || !hasSelection || !isReady}
            loading={preparingId === server.id}
            icon={preparingId === server.id ? undefined : <Wrench size={14} />}
          >
            Run preparation
          </Button>
        </div>
      </div>
    </div>
  );
}
