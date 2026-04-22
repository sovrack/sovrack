import {
  Eye,
  KeyRound,
  Loader2,
  Pencil,
  Play,
  Trash2,
  Wrench,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Server } from '@/types/server';

type ServerActionsProps = {
  server: Server;
  isBusy: boolean;
  verifyingId: string | null;
  installingKeyId: string | null;
  registeringId: string | null;
  deletingId: string | null;
  updatingId: string | null;
  onVerify: (id: string) => Promise<void>;
  onInstallKey: (server: Server) => void;
  onOpenPrepare: (server: Server) => void;
  onOpenDetails: (server: Server) => void;
  onOpenRunner: (serverId: string) => void;
  onEdit: (server: Server) => void;
  onDelete: (server: Server) => void;
};

export function ServerActions({
  server,
  isBusy,
  verifyingId,
  installingKeyId,
  registeringId,
  deletingId,
  updatingId,
  onVerify,
  onInstallKey,
  onOpenPrepare,
  onOpenDetails,
  onOpenRunner,
  onEdit,
  onDelete,
}: ServerActionsProps) {
  const needsSshKeyInstall =
    server.connectionMode === 'ssh' &&
    server.onboardingStep === 'PENDING' &&
    !server.isVerified;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {needsSshKeyInstall && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onInstallKey(server)}
          disabled={isBusy}
          loading={installingKeyId === server.id}
          icon={installingKeyId === server.id ? null : <KeyRound size={13} />}
          className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
        >
          Install SSH key
        </Button>
      )}

      <Button
        variant="secondary"
        size="sm"
        onClick={() => void onVerify(server.id)}
        disabled={isBusy || needsSshKeyInstall}
        loading={verifyingId === server.id}
        icon={verifyingId === server.id ? null : <Zap size={13} className="text-[var(--text-secondary)]" />}
      >
        Verify SSH
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => onEdit(server)}
        disabled={isBusy}
        loading={updatingId === server.id}
        icon={updatingId === server.id ? null : <Pencil size={13} />}
      >
        Edit
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => onOpenPrepare(server)}
        disabled={isBusy}
        icon={<Wrench size={13} />}
      >
        Prepare VPS
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => onOpenDetails(server)}
        disabled={isBusy}
        icon={<Eye size={13} />}
      >
        Details
      </Button>

      {server.hasDocker && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onOpenRunner(server.id)}
          disabled={isBusy}
          loading={registeringId === server.id}
          icon={registeringId === server.id ? null : <Play size={13} />}
          className="border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--hover)]"
        >
          Register Runner
        </Button>
      )}

      <button
        onClick={() => onDelete(server)}
        disabled={isBusy}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/20 text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
        aria-label={`Delete ${server.name}`}
      >
        {deletingId === server.id ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Trash2 size={13} />
        )}
      </button>
    </div>
  );
}
