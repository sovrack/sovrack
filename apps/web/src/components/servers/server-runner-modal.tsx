import { Loader2, Play, X } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-[var(--text-secondary)] transition hover:bg-[var(--bg-card)]/8 hover:text-[var(--text-primary)]"
        >
          <X size={16} />
        </button>

        <h3 className="text-base font-semibold text-[var(--text-primary)]">Enregistrer GitLab Runner</h3>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Le runner sera enregistré sur le serveur via SSH.
        </p>

        {error && (
          <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              URL GitLab <span className="text-red-400">*</span>
            </label>
            <input
              type="url"
              value={gitlabUrl}
              onChange={(event) => onGitlabUrlChange(event.target.value)}
              placeholder="https://gitlab.example.com"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-3 py-2.5 font-mono text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Token d&apos;enregistrement <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              value={token}
              onChange={(event) => onTokenChange(event.target.value)}
              placeholder="GR1345xyz..."
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-3 py-2.5 font-mono text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={Boolean(registeringId)}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-card)]/10 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={() => void onSubmit(openServerId)}
            disabled={Boolean(registeringId)}
            className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-50"
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
