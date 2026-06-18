'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, Copy, Expand, Minimize2, TerminalSquare } from 'lucide-react';
import type { LogLine } from '@/types/deployment';

type LogTerminalProps = {
  logs: LogLine[];
  isLive: boolean;
};

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return '--:--:--';
  }

  return date.toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function LogTerminal({ logs, isLive }: LogTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Auto-scroll to the bottom on each new line.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    });
  }, [logs]);

  useEffect(() => {
    const onFullScreenChange = () => {
      setIsFullscreen(document.fullscreenElement === terminalRef.current);
    };

    document.addEventListener('fullscreenchange', onFullScreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullScreenChange);
    };
  }, []);

  const plainLogs = useMemo(
    () =>
      logs
        .map((line) => `[${formatTime(line.timestamp)}] ${line.message}`)
        .join('\n'),
    [logs],
  );

  const copyLogs = async () => {
    if (!plainLogs) {
      return;
    }

    await navigator.clipboard.writeText(plainLogs);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const toggleFullscreen = async () => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    if (document.fullscreenElement === terminal) {
      await document.exitFullscreen();
      return;
    }

    await terminal.requestFullscreen();
  };

  return (
    <div
      ref={terminalRef}
      className={clsx(
        'rounded-2xl border border-[var(--border)] bg-black text-[var(--text-primary)] shadow-sm',
        isFullscreen && 'h-screen w-screen rounded-none',
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <TerminalSquare size={16} className="text-[var(--text-primary)]" />
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            Deployment terminal
          </p>
          {isLive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--text-primary)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-muted)]" />
              Live
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copyLogs()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:border-[var(--border)] hover:bg-[var(--bg-card)]"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:border-[var(--border)] hover:bg-[var(--bg-card)]"
          >
            {isFullscreen ? <Minimize2 size={12} /> : <Expand size={12} />}
            {isFullscreen ? 'Collapse' : 'Fullscreen'}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={clsx(
          'max-h-[500px] overflow-y-auto px-4 py-3 font-mono text-xs leading-6',
          isFullscreen && 'max-h-[calc(100vh-58px)]',
        )}
      >
        {logs.length === 0 ? (
          <p className="text-[var(--text-secondary)]">No logs available yet.</p>
        ) : (
          logs.map((line, index) => (
            <p
              key={`${line.timestamp}-${index}`}
              className={clsx(
                'whitespace-pre-wrap break-words',
                line.level === 'error' && 'text-red-400',
                line.level === 'success' && 'text-green-400',
                line.level === 'info' && 'text-[var(--text-primary)]',
              )}
            >
              <span className="mr-2 text-[var(--text-secondary)]">[{formatTime(line.timestamp)}]</span>
              {line.message}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
