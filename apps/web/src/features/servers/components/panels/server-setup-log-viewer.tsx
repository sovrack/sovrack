"use client";

import { useCallback, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useSetupLogStream } from "@/features/servers/api/use-setup-log-stream";
import {
  useSetup,
  useSetupLogs,
} from "@/features/servers/api/use-servers";
import type {
  ServerSetup,
  ServerSetupLog,
} from "@/features/servers/types/server";

type Props = {
  setup: ServerSetup | null;
  onClose: () => void;
};

export function ServerSetupLogViewer({ setup, onClose }: Props) {
  const [streamedLogs, setStreamedLogs] = useState<ServerSetupLog[]>([]);
  const setupQuery = useSetup(setup?.id ?? null);
  const { data: persistedLogs = [] } = useSetupLogs(
    setup?.id ?? null,
  );
  const currentSetup = setupQuery.data ?? setup;

  const handleLog = useCallback((log: ServerSetupLog) => {
    setStreamedLogs((prev) => {
      if (prev.some((item) => item.id === log.id)) return prev;
      return [...prev, log];
    });
  }, []);

  useSetupLogStream({
    setupId: setup?.id ?? null,
    onLog: handleLog,
  });

  const logs = useMemo(() => {
    const map = new Map<string, ServerSetupLog>();
    for (const log of [...persistedLogs, ...streamedLogs]) {
      map.set(log.id, log);
    }
    return Array.from(map.values()).sort((a, b) => a.lineNumber - b.lineNumber);
  }, [persistedLogs, streamedLogs]);

  if (!currentSetup) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg border border-border bg-card shadow-theme-lg">
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-secondary">
              Setup logs
            </p>
            <h2 className="mt-1 text-xl font-semibold text-primary">
              {currentSetup.status}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-secondary transition hover:bg-hover/10 hover:text-primary"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-black px-4 py-3 font-mono text-xs text-primary">
          {logs.length === 0 ? (
            <p className="text-secondary">Waiting for logs...</p>
          ) : (
            logs.map((log) => (
              <p
                key={log.id}
                className={
                  log.level === "ERROR"
                    ? "text-red-300"
                    : log.level === "WARNING"
                      ? "text-yellow-200"
                      : "text-primary"
                }
              >
                <span className="text-muted">
                  {String(log.lineNumber).padStart(4, "0")}
                </span>{" "}
                <span className="text-muted">[{log.source}]</span>{" "}
                {log.message}
              </p>
            ))
          )}
        </div>
        <div className="flex items-center justify-end border-t border-border px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
