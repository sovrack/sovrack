'use client';

import { useCallback, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { usePreparationLogStream } from '@/features/servers/api/use-preparation-log-stream';
import { usePreparation, usePreparationLogs } from '@/features/servers/api/use-servers';
import type { ServerPreparation, ServerPreparationLog } from '@/features/servers/types/server';

type Props = {
  preparation: ServerPreparation | null;
  onClose: () => void;
};

export function ServerPreparationLogViewer({ preparation, onClose }: Props) {
  const [streamedLogs, setStreamedLogs] = useState<ServerPreparationLog[]>([]);
  const preparationQuery = usePreparation(preparation?.id ?? null);
  const { data: persistedLogs = [] } = usePreparationLogs(preparation?.id ?? null);
  const currentPreparation = preparationQuery.data ?? preparation;

  const handleLog = useCallback((log: ServerPreparationLog) => {
    setStreamedLogs((prev) => {
      if (prev.some((item) => item.id === log.id)) return prev;
      return [...prev, log];
    });
  }, []);

  usePreparationLogStream({
    preparationId: preparation?.id ?? null,
    onLog: handleLog,
  });

  const logs = useMemo(() => {
    const map = new Map<string, ServerPreparationLog>();
    for (const log of [...persistedLogs, ...streamedLogs]) {
      map.set(log.id, log);
    }
    return Array.from(map.values()).sort((a, b) => a.lineNumber - b.lineNumber);
  }, [persistedLogs, streamedLogs]);

  if (!currentPreparation) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
              Preparation logs
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
              {currentPreparation.status}
            </h2>
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
        <div className="min-h-0 flex-1 overflow-y-auto bg-black px-4 py-3 font-mono text-xs text-zinc-100">
          {logs.length === 0 ? (
            <p className="text-zinc-400">Waiting for logs...</p>
          ) : (
            logs.map((log) => (
              <p
                key={log.id}
                className={
                  log.level === 'ERROR'
                    ? 'text-red-300'
                    : log.level === 'WARNING'
                      ? 'text-yellow-200'
                      : 'text-zinc-100'
                }
              >
                <span className="text-zinc-500">{String(log.lineNumber).padStart(4, '0')}</span>{' '}
                <span className="text-zinc-500">[{log.source}]</span> {log.message}
              </p>
            ))
          )}
        </div>
        <div className="flex items-center justify-end border-t border-[var(--border)] px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
