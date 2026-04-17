import { Loader2, Wrench } from 'lucide-react';
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
  onOptionChange: (
    server: Server,
    field: keyof InstallOptions,
    value: boolean,
  ) => void;
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
  const hasInstallSelection =
    installOptions.docker || installOptions.ansible || installOptions.runner;

  return (
    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">
        {server.connectionMode === 'agent' ? 'Agent Automation' : 'SSH Automation'}
      </p>
      <p className="mt-1 text-xs text-blue-700/80">
        {server.connectionMode === 'agent'
          ? 'Actions are queued and executed when the agent pulls pending jobs.'
          : 'Install missing tools remotely from this interface.'}
      </p>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={installOptions.docker}
            onChange={(event) => onOptionChange(server, 'docker', event.target.checked)}
            disabled={isBusy}
          />
          Docker
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={installOptions.ansible}
            onChange={(event) => onOptionChange(server, 'ansible', event.target.checked)}
            disabled={isBusy}
          />
          Ansible
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={installOptions.runner}
            onChange={(event) => onOptionChange(server, 'runner', event.target.checked)}
            disabled={isBusy}
          />
          GitLab Runner
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void onInstall(server)}
          disabled={isBusy || !hasInstallSelection}
          className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
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
