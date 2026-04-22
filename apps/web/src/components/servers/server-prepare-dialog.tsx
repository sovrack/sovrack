'use client';

import { X, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Server } from '@/types/server';

export type InstallOptions = {
  docker: boolean;
  ansible: boolean;
  runner: boolean;
};

type ServerPrepareDialogProps = {
  open: boolean;
  server: Server | null;
  installOptions: InstallOptions;
  isBusy: boolean;
  installingId: string | null;
  onClose: () => void;
  onOptionChange: (
    server: Server,
    field: keyof InstallOptions,
    value: boolean,
  ) => void;
  onInstall: (server: Server) => Promise<void>;
};

export function ServerPrepareDialog({
  open,
  server,
  installOptions,
  isBusy,
  installingId,
  onClose,
  onOptionChange,
  onInstall,
}: ServerPrepareDialogProps) {
  if (!open || !server) return null;

  const dockerSelected = server.hasDocker ? false : installOptions.docker;
  const ansibleSelected = server.hasAnsible ? false : installOptions.ansible;
  const runnerSelected = server.hasRunner ? false : installOptions.runner;
  const hasInstallSelection = dockerSelected || ansibleSelected || runnerSelected;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />

      <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
              Infrastructure
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
              Prepare VPS
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

        <div className="space-y-4 px-6 py-5">
          <p className="text-sm text-[var(--text-secondary)]">
            Choose what to install on this VPS.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(['docker', 'ansible', 'runner'] as const).map((tool) => {
              const isInstalled =
                tool === 'docker'
                  ? server.hasDocker
                  : tool === 'ansible'
                    ? server.hasAnsible
                    : server.hasRunner;
              const label =
                tool === 'runner'
                  ? 'GitLab Runner'
                  : tool.charAt(0).toUpperCase() + tool.slice(1);

              return (
                <label
                  key={tool}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--hover)] px-3 py-3 text-sm text-[var(--text-primary)]"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isInstalled || installOptions[tool]}
                      onChange={(event) =>
                        onOptionChange(server, tool, event.target.checked)
                      }
                      disabled={isBusy || isInstalled}
                      className="accent-zinc-500"
                    />
                    {label}
                  </span>
                  {isInstalled && (
                    <Badge tone="success" size="sm">
                      Installed
                    </Badge>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-card)] px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isBusy}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void onInstall(server)}
            disabled={isBusy || !hasInstallSelection}
            loading={installingId === server.id}
            icon={installingId === server.id ? undefined : <Wrench size={14} />}
          >
            Run setup
          </Button>
        </div>
      </div>
    </div>
  );
}
