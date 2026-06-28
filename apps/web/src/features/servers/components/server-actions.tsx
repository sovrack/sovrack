import { Eye, KeyRound, Loader2, Pencil, Radar, ScrollText, Trash2, Wrench, Zap } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { Server } from '@/features/servers/types/server';

type ServerActionsProps = {
  server: Server;
  isBusy: boolean;
  verifyingId: string | null;
  detectingId: string | null;
  preparingId: string | null;
  installingKeyId: string | null;
  deletingId: string | null;
  updatingId: string | null;
  onVerify: (id: string) => Promise<void>;
  onDetect: (id: string) => Promise<void>;
  onInstallKey: (server: Server) => void;
  onOpenPrepare: (server: Server) => void;
  onOpenDetails: (server: Server) => void;
  onOpenLogs: (server: Server) => void;
  onEdit: (server: Server) => void;
  onDelete: (server: Server) => void;
};

function resolvePrimaryAction(server: Server) {
  const needsSshKeyInstall =
    server.connectionMode === 'ssh' &&
    server.onboardingStep === 'PENDING' &&
    !server.isVerified;

  if (needsSshKeyInstall) {
    return 'install-key' as const;
  }
  if (!server.isVerified || server.status === 'VALIDATION_FAILED') {
    return 'validate' as const;
  }
  if (!server.lastDetectedAt && server.status !== 'INFO_DETECTED') {
    return 'detect' as const;
  }
  return 'prepare' as const;
}

export function ServerActions({
  server,
  isBusy,
  verifyingId,
  detectingId,
  preparingId,
  installingKeyId,
  deletingId,
  updatingId,
  onVerify,
  onDetect,
  onInstallKey,
  onOpenPrepare,
  onOpenDetails,
  onOpenLogs,
  onEdit,
  onDelete,
}: ServerActionsProps) {
  const primary = resolvePrimaryAction(server);

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {primary === 'install-key' && (
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

      {primary === 'validate' && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void onVerify(server.id)}
          disabled={isBusy}
          loading={verifyingId === server.id}
          icon={verifyingId === server.id ? null : <Zap size={13} />}
        >
          Validate SSH
        </Button>
      )}

      {primary === 'detect' && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void onDetect(server.id)}
          disabled={isBusy}
          loading={detectingId === server.id}
          icon={detectingId === server.id ? null : <Radar size={13} />}
        >
          Detect Info
        </Button>
      )}

      {primary === 'prepare' && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onOpenPrepare(server)}
          disabled={isBusy || server.status === 'PREPARING'}
          loading={preparingId === server.id}
          icon={preparingId === server.id ? null : <Wrench size={13} />}
        >
          {server.status === 'PREPARATION_FAILED'
            ? 'Retry Preparation'
            : server.status === 'PREPARED' || server.status === 'PARTIALLY_PREPARED'
              ? 'Re-prepare'
              : 'Prepare Server'}
        </Button>
      )}

      <Button
        variant="secondary"
        size="sm"
        onClick={() => onOpenDetails(server)}
        disabled={isBusy}
        icon={<Eye size={13} />}
      >
        Details
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => onOpenLogs(server)}
        disabled={isBusy}
        icon={<ScrollText size={13} />}
      >
        Logs
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

      <button type="button"
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
