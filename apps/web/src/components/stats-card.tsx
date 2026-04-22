import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

type Trend = {
  value: number;
  direction: 'up' | 'down';
};

type StatsCardProps = {
  title: string;
  value: number | string;
  hint?: string;
  tone?: 'brand' | 'ok' | 'accent' | 'neutral';
  icon?: LucideIcon;
  trend?: Trend;
};

const toneConfig = {
  brand: {
    iconBg: 'bg-[var(--hover)]',
    iconColor: 'text-[var(--text-secondary)]',
    valueColor: 'text-[var(--text-primary)]',
    trend: 'bg-[var(--text-primary)]/10 text-[var(--text-secondary)]',
  },
  ok: {
    iconBg: 'bg-[var(--hover)]',
    iconColor: 'text-[var(--text-secondary)]',
    valueColor: 'text-[var(--text-primary)]',
    trend: 'bg-green-500/10 text-green-400',
  },
  accent: {
    iconBg: 'bg-[var(--hover)]',
    iconColor: 'text-[var(--text-secondary)]',
    valueColor: 'text-[var(--text-primary)]',
    trend: 'bg-[var(--text-primary)]/10 text-[var(--text-secondary)]',
  },
  neutral: {
    iconBg: 'bg-[var(--hover)]',
    iconColor: 'text-[var(--text-secondary)]',
    valueColor: 'text-[var(--text-primary)]',
    trend: 'bg-[var(--text-primary)]/10 text-[var(--text-secondary)]',
  },
};

export function StatsCard({
  title,
  value,
  hint,
  tone = 'brand',
  icon: Icon,
  trend,
}: StatsCardProps) {
  const config = toneConfig[tone];
  const trendPositive = trend?.direction === 'up';

  return (
    <div
      className={clsx(
        'rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm transition duration-200',
      )}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {title}
          </p>
          <p
            className={clsx(
              'mt-4 text-3xl font-bold leading-none tracking-[-0.04em]',
              config.valueColor,
            )}
          >
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-[var(--text-secondary)]">{hint}</p>}
        </div>

        {Icon && (
          <div
            className={clsx(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
              config.iconBg,
            )}
          >
            <Icon size={20} className={config.iconColor} />
          </div>
        )}
      </div>

      {trend && (
        <div className="mt-5 flex items-center gap-2">
          <span
            className={clsx(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
              trendPositive ? config.trend : 'bg-red-500/10 text-red-400',
            )}
          >
            {trendPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
          <span className="text-xs text-[var(--text-secondary)]">vs previous period</span>
        </div>
      )}
    </div>
  );
}
