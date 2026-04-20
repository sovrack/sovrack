import { Loader2, Play, Trash2, Zap } from 'lucide-react';
import type { Server } from '@/types/server';

type ServerActionsProps = {
  server: Server;
  isBusy: boolean;
  verifyingId: string | null;
  registeringId: string | null;
  deletingId: string | null;
  onVerify: (id: string) => Promise<void>;
  onOpenRunner: (serverId: string) => void;
  onDelete: (id: string, name: string) => Promise<void>;
};

export function ServerActions({
  server,
  isBusy,
  verifyingId,
  registeringId,
  deletingId,
  onVerify,
  onOpenRunner,
  onDelete,
}: ServerActionsProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <button
        onClick={() => void onVerify(server.id)}
        disabled={isBusy}
        className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
      >
        {verifyingId === server.id ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Zap size={13} className="text-brand-500" />
        )}
        {server.connectionMode === 'agent' ? 'Queue verify' : 'Verify SSH'}
      </button>

      {server.hasDocker && (
        <button
          onClick={() => onOpenRunner(server.id)}
          disabled={isBusy}
          className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-50 disabled:opacity-50"
        >
          {registeringId === server.id ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Play size={13} />
          )}
          Register Runner
        </button>
      )}

      <button
        onClick={() => void onDelete(server.id, server.name)}
        disabled={isBusy}
        className="flex items-center gap-1.5 rounded-xl border border-red-100 bg-white px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
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
