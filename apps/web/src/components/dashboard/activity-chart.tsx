'use client';

import type { DayActivity } from '@/types/dashboard';

type Props = { data: DayActivity[] };

function fmt(date: string) {
  return new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
  });
}

export function ActivityChart({ data }: Props) {
  const max = Math.max(...data.map((d) => d.total), 1);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <p className="mb-4 text-sm font-semibold text-[var(--text-primary)]">
        Activity — last 7 days
      </p>
      <div className="flex h-32 items-end gap-2">
        {data.map((day) => {
          const heightPct = Math.round((day.total / max) * 100);
          const successPct = day.total > 0 ? Math.round((day.success / day.total) * 100) : 0;
          const failedPct = day.total > 0 ? Math.round((day.failed / day.total) * 100) : 0;

          return (
            <div
              key={day.date}
              className="group relative flex flex-1 flex-col items-center gap-1"
            >
              {/* Tooltip */}
              <div className="pointer-events-none absolute bottom-full mb-2 hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-xs shadow-lg group-hover:block z-10 min-w-[120px]">
                <p className="font-semibold text-[var(--text-primary)]">{fmt(day.date)}</p>
                <p className="text-emerald-400">{day.success} success</p>
                <p className="text-red-400">{day.failed} failures</p>
                <p className="text-[var(--text-secondary)]">{day.total} total</p>
              </div>

              {/* Bar */}
              <div
                className="relative w-full overflow-hidden rounded-t-sm"
                style={{ height: `${Math.max(heightPct, day.total > 0 ? 8 : 2)}%` }}
              >
                {day.total === 0 ? (
                  <div className="h-full w-full bg-[var(--border)] opacity-40 rounded" />
                ) : (
                  <div className="flex h-full flex-col">
                    <div
                      className="bg-red-500/70"
                      style={{ height: `${failedPct}%` }}
                    />
                    <div
                      className="bg-emerald-500/70"
                      style={{ height: `${successPct}%`, flexGrow: 1 }}
                    />
                  </div>
                )}
              </div>

              {/* Label */}
              <span className="text-[10px] text-[var(--text-secondary)] truncate w-full text-center">
                {fmt(day.date)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-xs text-[var(--text-secondary)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500/70" />
          Success
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500/70" />
          Failures
        </span>
      </div>
    </div>
  );
}
