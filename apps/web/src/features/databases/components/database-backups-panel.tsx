"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Download,
  Loader2,
  RotateCcw,
} from "lucide-react";
import {
  databaseBackupsService,
  type DatabaseBackup,
} from "@/features/databases/api/database-backups.service";
import { getApiErrorMessage } from "@/shared/lib/api";
import { useConfirm } from "@/shared/contexts/confirm-context";
import { timeAgo, formatBytes } from "@/shared/lib/format-date";

const STATUS_ICON: Record<DatabaseBackup["status"], React.ReactNode> = {
  SUCCESS: <CheckCircle2 size={12} className="text-green-400" />,
  FAILED: <AlertTriangle size={12} className="text-red-400" />,
  RUNNING: <Loader2 size={12} className="animate-spin text-blue-400" />,
  PENDING: <Clock size={12} className="text-amber-400" />,
};

type Props = { serviceEnvId: string; serviceName?: string };

export function DatabaseBackupsPanel({ serviceEnvId, serviceName }: Props) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [restoreWarning, setRestoreWarning] = useState<string | null>(null);
  const queryKey = ["database-backups", serviceEnvId];

  const {
    data: backups,
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => databaseBackupsService.list(serviceEnvId),
    refetchInterval: (query) =>
      (query.state.data ?? []).some(
        (b) => b.status === "RUNNING" || b.status === "PENDING",
      )
        ? 3_000
        : false,
  });

  const createBackup = useMutation({
    mutationFn: () => databaseBackupsService.create(serviceEnvId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const restoreBackup = useMutation({
    mutationFn: (backupId: string) =>
      databaseBackupsService.restore(serviceEnvId, backupId),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey });
      // Non-fatal restore warnings surfaced inline (no native alert popup).
      setRestoreWarning(
        res.warnings ? `Restored with warnings: ${res.warnings}` : null,
      );
    },
  });

  const onRestore = async (backupId: string) => {
    const ok = await confirm({
      title: "Restore this backup?",
      description: "This overwrites the current database content.",
      confirmLabel: "Restore",
      variant: "danger",
    });
    if (ok) {
      setRestoreWarning(null);
      restoreBackup.mutate(backupId);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
          <Database size={12} />
          Backups{serviceName ? ` · ${serviceName}` : ""}
        </p>
        <button
          type="button"
          onClick={() => createBackup.mutate()}
          disabled={createBackup.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--hover)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] transition hover:opacity-90 disabled:opacity-50"
        >
          {createBackup.isPending ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Download size={11} />
          )}
          Back up now
        </button>
      </div>

      {createBackup.error && (
        <p className="mt-2 text-xs text-red-400">
          {getApiErrorMessage(createBackup.error)}
        </p>
      )}
      {restoreBackup.error && (
        <p className="mt-2 text-xs text-red-400">
          {getApiErrorMessage(restoreBackup.error)}
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-400">{getApiErrorMessage(error)}</p>
      )}
      {restoreWarning && (
        <p className="mt-2 text-xs text-amber-400">{restoreWarning}</p>
      )}

      <ul className="mt-2 space-y-1.5">
        {isLoading ? (
          <li className="h-6 animate-pulse rounded bg-[var(--hover)]" />
        ) : (backups ?? []).length === 0 ? (
          <li className="text-xs text-[var(--text-muted)]">No backups yet.</li>
        ) : (
          (backups ?? []).map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between text-xs"
            >
              <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                {STATUS_ICON[b.status]}
                {timeAgo(b.createdAt)}
                <span className="rounded bg-[var(--hover)] px-1 py-0.5 text-[9px] font-semibold uppercase text-[var(--text-muted)]">
                  {b.trigger}
                </span>
              </span>
              <span className="flex items-center gap-2 text-[var(--text-muted)]">
                {b.status === "FAILED"
                  ? (b.error?.slice(0, 40) ?? "failed")
                  : formatBytes(b.sizeBytes)}
                {b.status === "SUCCESS" && (
                  <button
                    type="button"
                    onClick={() => void onRestore(b.id)}
                    disabled={restoreBackup.isPending}
                    title="Restore this backup into the database"
                    className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)] transition hover:opacity-90 disabled:opacity-50"
                  >
                    {restoreBackup.isPending &&
                    restoreBackup.variables === b.id ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <RotateCcw size={10} />
                    )}
                    Restore
                  </button>
                )}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
