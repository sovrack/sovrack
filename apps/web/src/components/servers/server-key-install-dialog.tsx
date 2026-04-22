'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, X } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { Server } from '@/types/server';

type ServerKeyInstallDialogProps = {
  open: boolean;
  server: Server | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (serverId: string, password: string) => Promise<void>;
};

function shellEscape(value: string): string {
  return value.replace(/'/g, `'"'"'`);
}

export function ServerKeyInstallDialog({
  open,
  server,
  loading,
  error,
  onClose,
  onSubmit,
}: ServerKeyInstallDialogProps) {
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTemporaryPassword('');
    setCopied(false);
  }, [open, server?.id]);

  const publicKey = server?.sshPublicKey?.trim() ?? '';
  const manualCommand = useMemo(() => {
    if (!publicKey) return '';
    return `mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && grep -qxF '${shellEscape(publicKey)}' ~/.ssh/authorized_keys || echo '${shellEscape(publicKey)}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`;
  }, [publicKey]);

  if (!open || !server) return null;

  const requiresPasswordInstall = server.connectionMode === 'ssh';

  const handleCopyPublicKey = async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!server || !temporaryPassword.trim()) return;
    await onSubmit(server.id, temporaryPassword.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
              Infrastructure
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
              Install SSH Key
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
          {error && <Alert tone="error">{error}</Alert>}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Generated public key
            </p>
            {publicKey ? (
              <>
                <p className="mt-2 break-all rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]">
                  {publicKey}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  icon={<Copy size={12} />}
                  onClick={() => void handleCopyPublicKey()}
                >
                  {copied ? 'Copied' : 'Copy key'}
                </Button>
              </>
            ) : (
              <p className="mt-2 text-sm text-red-500">
                Public key is missing for this server.
              </p>
            )}
          </div>

          {requiresPasswordInstall && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                Temporary VPS password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={temporaryPassword}
                onChange={(event) => setTemporaryPassword(event.target.value)}
                placeholder="Temporary SSH password"
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20"
              />
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Used once to append the platform public key in{' '}
                <code className="font-mono">~/.ssh/authorized_keys</code>.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Manual installation command
            </p>
            <p className="mt-2 break-all rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]">
              {manualCommand || 'Public key unavailable'}
            </p>
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-card)] px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={loading}
            disabled={!requiresPasswordInstall || !temporaryPassword.trim() || !publicKey.trim()}
            icon={loading ? undefined : <KeyRound size={14} />}
          >
            Install key
          </Button>
        </div>
      </form>
    </div>
  );
}
