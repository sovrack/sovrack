'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, TerminalSquare, X } from 'lucide-react';
import { environmentsService } from '@/services/environments.service';
import { getApiErrorMessage } from '@/lib/api';

// xterm est client-only.
const SshTerminal = dynamic(
  () => import('@/components/terminal/ssh-terminal').then((m) => m.SshTerminal),
  { ssr: false },
);

/**
 * Terminal SSH en dialog, scopé au SERVEUR cible de l'environnement sélectionné
 * du service (au lieu de rediriger vers la page Terminal générique).
 */
export function ServiceTerminalDialog({
  projectId,
  envId,
  envName,
  open,
  onClose,
}: {
  projectId: string;
  envId: string | null;
  envName?: string;
  open: boolean;
  onClose: () => void;
}) {
  const [serverId, setServerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !envId) return;
    let alive = true;
    setLoading(true); setError(null); setServerId(null);
    environmentsService.getServers(projectId, envId)
      .then((srv) => {
        if (!alive) return;
        const first = (srv as Array<{ id?: string }>)[0];
        if (first?.id) setServerId(first.id);
        else setError('Aucun serveur attaché à cet environnement — attachez-en un dans l\'onglet Environments du projet.');
      })
      .catch((e) => { if (alive) setError(getApiErrorMessage(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, envId, projectId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <TerminalSquare size={15} /> Terminal {envName ? `— ${envName}` : ''}
          </h2>
          <button type="button" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]">
            <X size={13} />
          </button>
        </div>
        <div className="min-h-0 flex-1 p-3">
          {!envId ? (
            <p className="text-sm text-[var(--text-muted)]">Sélectionnez un environnement.</p>
          ) : loading ? (
            <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Loader2 size={14} className="animate-spin" /> Résolution du serveur cible…</p>
          ) : error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : serverId ? (
            <SshTerminal serverId={serverId} onClose={onClose} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
