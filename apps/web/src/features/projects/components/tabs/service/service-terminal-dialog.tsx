'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, TerminalSquare } from 'lucide-react';
import { environmentsService } from '@/features/projects/api/environments.service';
import { getApiErrorMessage } from '@/shared/lib/api';
import { Modal } from '@/shared/ui/modal';

// xterm est client-only.
const SshTerminal = dynamic(
  () => import('@/features/terminal').then((m) => m.SshTerminal),
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
        else setError('No server attached to this environment — attach one in the project Environments tab.');
      })
      .catch((e) => { if (alive) setError(getApiErrorMessage(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, envId, projectId]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={`Terminal${envName ? ` — ${envName}` : ''}`}
      icon={<TerminalSquare size={16} className="text-[var(--text-secondary)]" />}
      contentClassName="!p-0"
    >
      <div className="h-[72vh] p-3">
        {!envId ? (
          <p className="text-sm text-[var(--text-muted)]">Select an environment.</p>
        ) : loading ? (
          <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 size={14} className="animate-spin" /> Resolving target server…
          </p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : serverId ? (
          <SshTerminal serverId={serverId} onClose={onClose} />
        ) : null}
      </div>
    </Modal>
  );
}
