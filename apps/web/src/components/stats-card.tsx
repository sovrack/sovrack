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
    iconBg: 'bg-brand-50',
    iconColor: 'text-brand-600',
    valueColor: 'text-slate-900',
    trend: 'bg-brand-50 text-brand-700',
  },
  ok: {
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    valueColor: 'text-slate-900',
    trend: 'bg-emerald-50 text-emerald-700',
  },
  accent: {
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
    valueColor: 'text-slate-900',
    trend: 'bg-orange-50 text-orange-700',
  },
  purple: {
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    valueColor: 'text-slate-900',
    trend: 'bg-purple-50 text-purple-700',
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
        'rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs transition duration-200 hover:-translate-y-0.5 hover:shadow-lg',
      )}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
            {title}
          </p>
          <p
            className={clsx(
              'mt-4 text-[30px] font-bold leading-none tracking-[-0.04em]',
              config.valueColor,
            )}
          >
            {value}
          </p>
          {hint && <p className="mt-2 text-sm text-slate-500">{hint}</p>}
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
              trendPositive ? config.trend : 'bg-red-50 text-red-600',
            )}
          >
            {trendPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
          <span className="text-xs text-slate-400">vs previous period</span>
        </div>
      )}
    </div>
  );
}
