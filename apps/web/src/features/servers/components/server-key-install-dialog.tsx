'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Modal } from '@/shared/ui/modal';
import type { Server } from '@/features/servers/types/server';

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

  if (!server) return null;

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
    if (!temporaryPassword.trim()) return;
    await onSubmit(server.id, temporaryPassword.trim());
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissable={!loading}
      size="lg"
      title="Install SSH Key"
      description={`${server.username}@${server.host}:${server.port}`}
      icon={
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--text-primary)]/15">
          <KeyRound size={16} className="text-[var(--text-secondary)]" />
        </div>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="server-key-install-form"
            loading={loading}
            disabled={!requiresPasswordInstall || !temporaryPassword.trim() || !publicKey.trim()}
            icon={loading ? undefined : <KeyRound size={14} />}
          >
            Install key
          </Button>
        </>
      }
    >
      <form id="server-key-install-form" onSubmit={handleSubmit} className="space-y-4">
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
      </form>
    </Modal>
  );
}
