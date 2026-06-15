'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, Database, Download, Loader2 } from 'lucide-react';
import { databaseBackupsService, type DatabaseBackup } from '@/services/database-backups.service';
import { getApiErrorMessage } from '@/lib/api';

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelative(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const STATUS_ICON: Record<DatabaseBackup['status'], React.ReactNode> = {
  SUCCESS: <CheckCircle2 size={12} className="text-green-400" />,
  FAILED: <AlertTriangle size={12} className="text-red-400" />,
  RUNNING: <Loader2 size={12} className="animate-spin text-blue-400" />,
  PENDING: <Clock size={12} className="text-amber-400" />,
};

type Props = { serviceEnvId: string; serviceName?: string };

export function DatabaseBackupsPanel({ serviceEnvId, serviceName }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ['database-backups', serviceEnvId];

  const { data: backups, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => databaseBackupsService.list(serviceEnvId),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((b) => b.status === 'RUNNING' || b.status === 'PENDING')
        ? 3_000
        : false,
  });

  const createBackup = useMutation({
    mutationFn: () => databaseBackupsService.create(serviceEnvId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
          <Database size={12} />
          Sauvegardes{serviceName ? ` · ${serviceName}` : ''}
        </p>
        <button
          type="button"
          onClick={() => createBackup.mutate()}
          disabled={createBackup.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--hover)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] transition hover:opacity-90 disabled:opacity-50"
        >
          {createBackup.isPending ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
          Sauvegarder
        </button>
      </div>

      {createBackup.error && (
        <p className="mt-2 text-xs text-red-400">{getApiErrorMessage(createBackup.error)}</p>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{getApiErrorMessage(error)}</p>}

      <ul className="mt-2 space-y-1.5">
        {isLoading ? (
          <li className="h-6 animate-pulse rounded bg-[var(--hover)]" />
        ) : (backups ?? []).length === 0 ? (
          <li className="text-xs text-[var(--text-muted)]">Aucune sauvegarde pour l’instant.</li>
        ) : (
          (backups ?? []).map((b) => (
            <li key={b.id} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                {STATUS_ICON[b.status]}
                {formatRelative(b.createdAt)}
                <span className="rounded bg-[var(--hover)] px-1 py-0.5 text-[9px] font-semibold uppercase text-[var(--text-muted)]">
                  {b.trigger}
                </span>
              </span>
              <span className="text-[var(--text-muted)]">
                {b.status === 'FAILED' ? (b.error?.slice(0, 40) ?? 'échec') : formatBytes(b.sizeBytes)}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
