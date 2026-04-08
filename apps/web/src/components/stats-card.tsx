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
  tone?: 'brand' | 'ok' | 'accent' | 'purple';
  icon?: LucideIcon;
  trend?: Trend;
};

const toneConfig = {
  brand: {
    wrapper: 'border-blue-100 bg-white',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    valueColor: 'text-slate-900',
  },
  ok: {
    wrapper: 'border-emerald-100 bg-white',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    valueColor: 'text-slate-900',
  },
  accent: {
    wrapper: 'border-orange-100 bg-white',
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    valueColor: 'text-slate-900',
  },
  purple: {
    wrapper: 'border-purple-100 bg-white',
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    valueColor: 'text-slate-900',
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
        'rounded-2xl border p-5 shadow-sm transition hover:shadow-md',
        config.wrapper,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
            {title}
          </p>
          <p className={clsx('mt-3 text-3xl font-bold leading-none', config.valueColor)}>
            {value}
          </p>
          {hint && (
            <p className="mt-2 text-xs text-slate-400">{hint}</p>
          )}
        </div>

        {Icon && (
          <div
            className={clsx(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
              config.iconBg,
            )}
          >
            <Icon size={20} className={config.iconColor} />
          </div>
        )}
      </div>

      {trend && (
        <div className="mt-4 flex items-center gap-1.5">
          <span
            className={clsx(
              'flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold',
              trendPositive
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-red-50 text-red-600',
            )}
          >
            {trendPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
          <span className="text-xs text-slate-400">vs last week</span>
        </div>
      )}
    </div>
  );
}
