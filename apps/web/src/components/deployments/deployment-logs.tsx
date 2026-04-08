'use client';

import { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';

type DeploymentLogsProps = {
  logs: string | null;
};

export function DeploymentLogs({ logs }: DeploymentLogsProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (!logs) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
        <Terminal size={28} className="text-slate-300" />
        <p className="mt-3 text-sm text-slate-400">No logs available yet.</p>
      </div>
    );
  }

  const lines = logs.split('\n');

  return (
    <div className="rounded-2xl bg-slate-900 p-5 overflow-auto max-h-[500px]">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-3 w-3 rounded-full bg-red-500" />
        <div className="h-3 w-3 rounded-full bg-amber-400" />
        <div className="h-3 w-3 rounded-full bg-emerald-400" />
        <span className="ml-2 text-xs font-mono text-slate-500">deployment logs</span>
      </div>
      <pre className="font-mono text-xs leading-relaxed text-slate-300 whitespace-pre-wrap break-all">
        {lines.map((line, i) => {
          const isError = /error|fail|fatal/i.test(line);
          const isSuccess = /success|ok|done|completed/i.test(line);
          const isWarn = /warn|warning/i.test(line);
          return (
            <span
              key={i}
              className={
                isError ? 'text-red-400' :
                isSuccess ? 'text-emerald-400' :
                isWarn ? 'text-amber-400' :
                'text-slate-300'
              }
            >
              {line}{'\n'}
            </span>
          );
        })}
      </pre>
      <div ref={bottomRef} />
    </div>
  );
}
