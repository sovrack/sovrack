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

  // Scroll automatique vers le bas à chaque nouvelle ligne.
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
        'rounded-2xl border border-slate-800 bg-black text-slate-100 shadow-sm',
        isFullscreen && 'h-screen w-screen rounded-none',
      )}
    >
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <TerminalSquare size={16} className="text-slate-300" />
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Deployment terminal
          </p>
          {isLive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-300" />
              Live
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copyLogs()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copié' : 'Copier'}
          </button>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
          >
            {isFullscreen ? <Minimize2 size={12} /> : <Expand size={12} />}
            {isFullscreen ? 'Réduire' : 'Plein écran'}
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
          <p className="text-slate-500">Aucun log disponible pour le moment.</p>
        ) : (
          logs.map((line, index) => (
            <p
              key={`${line.timestamp}-${index}`}
              className={clsx(
                'whitespace-pre-wrap break-words',
                line.level === 'error' && 'text-red-400',
                line.level === 'success' && 'text-emerald-400',
                line.level === 'info' && 'text-slate-100',
              )}
            >
              <span className="mr-2 text-slate-500">[{formatTime(line.timestamp)}]</span>
              {line.message}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
