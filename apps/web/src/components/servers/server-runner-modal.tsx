import { Loader2, Play } from 'lucide-react';

type ServerRunnerModalProps = {
  openServerId: string | null;
  gitlabUrl: string;
  onGitlabUrlChange: (value: string) => void;
  token: string;
  onTokenChange: (value: string) => void;
  error: string | null;
  registeringId: string | null;
  onClose: () => void;
  onSubmit: (serverId: string) => Promise<void>;
};

export function ServerRunnerModal({
  openServerId,
  gitlabUrl,
  onGitlabUrlChange,
  token,
  onTokenChange,
  error,
  registeringId,
  onClose,
  onSubmit,
}: ServerRunnerModalProps) {
  if (!openServerId) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h3 className="text-base font-semibold text-slate-900">Enregistrer GitLab Runner</h3>
        <p className="mt-1 text-xs text-slate-500">
          Le runner sera enregistré sur le serveur via SSH.
        </p>

        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              URL GitLab <span className="text-red-400">*</span>
            </label>
            <input
              type="url"
              value={gitlabUrl}
              onChange={(event) => onGitlabUrlChange(event.target.value)}
              placeholder="https://gitlab.example.com"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Token d&apos;enregistrement <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              value={token}
              onChange={(event) => onTokenChange(event.target.value)}
              placeholder="GR1345xyz..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={Boolean(registeringId)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={() => void onSubmit(openServerId)}
            disabled={Boolean(registeringId)}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
          >
            {registeringId === openServerId ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
