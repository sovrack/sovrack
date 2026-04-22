import { Loader2, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Server } from '@/types/server';

type InstallOptions = {
  docker: boolean;
  ansible: boolean;
  runner: boolean;
};

type ServerInstallPanelProps = {
  server: Server;
  isBusy: boolean;
  installingId: string | null;
  installOptions: InstallOptions;
  onOptionChange: (server: Server, field: keyof InstallOptions, value: boolean) => void;
  onInstall: (server: Server) => Promise<void>;
};

export function ServerInstallPanel({
  server,
  isBusy,
  installingId,
  installOptions,
  onOptionChange,
  onInstall,
}: ServerInstallPanelProps) {
  const dockerSelected = server.hasDocker ? false : installOptions.docker;
  const ansibleSelected = server.hasAnsible ? false : installOptions.ansible;
  const runnerSelected = server.hasRunner ? false : installOptions.runner;
  const hasInstallSelection = dockerSelected || ansibleSelected || runnerSelected;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
        SSH Automation
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        Install missing tools remotely from this interface.
      </p>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(['docker', 'ansible', 'runner'] as const).map((tool) => {
          const isInstalled =
            tool === 'docker' ? server.hasDocker : tool === 'ansible' ? server.hasAnsible : server.hasRunner;
          const label = tool === 'runner' ? 'GitLab Runner' : tool.charAt(0).toUpperCase() + tool.slice(1);
          return (
            <label
              key={tool}
              className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--hover)] px-3 py-2 text-xs text-[var(--text-secondary)]"
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isInstalled || installOptions[tool]}
                  onChange={(event) => onOptionChange(server, tool, event.target.checked)}
                  disabled={isBusy || isInstalled}
                  className="accent-indigo-500"
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

      <div className="mt-3">
        <button
          onClick={() => void onInstall(server)}
          disabled={isBusy || !hasInstallSelection}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--hover)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--border)] disabled:opacity-50"
        >
          {installingId === server.id ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Wrench size={13} />
          )}
          Run setup
        </button>
      </div>
    </div>
  );
}
