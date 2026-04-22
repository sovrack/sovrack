import clsx from 'clsx';
import type { ReactNode } from 'react';

type BadgeTone =
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'brand'
  | 'purple';

type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
};

const toneMap: Record<BadgeTone, string> = {
  default: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  error: 'bg-red-50 text-red-600',
  info: 'bg-blue-50 text-blue-700',
  brand: 'bg-brand-50 text-brand-700',
  purple: 'bg-purple-50 text-purple-700',
};

const dotToneMap: Record<BadgeTone, string> = {
  default: 'bg-slate-400',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  brand: 'bg-brand-500',
  purple: 'bg-purple-500',
};

export function Badge({
  children,
  tone = 'default',
  size = 'md',
  dot,
  className,
}: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-[10px] uppercase tracking-wider' : 'px-2.5 py-1 text-xs',
        toneMap[tone],
        className,
      )}
    >
      {dot && (
        <span className={clsx('h-1.5 w-1.5 rounded-full', dotToneMap[tone])} />
      )}
      {children}
    </span>
  );
}
