import clsx from 'clsx';
import type { ReactNode } from 'react';

type BadgeTone =
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'brand';

type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
};

const toneMap: Record<BadgeTone, string> = {
  default: 'border border-zinc-500/20 bg-[var(--text-primary)]/10 text-[var(--text-muted)]',
  success: 'border border-green-500/20 bg-green-500/10 text-green-400',
  warning: 'border border-yellow-500/20 bg-yellow-500/10 text-yellow-500',
  error: 'border border-red-500/20 bg-red-500/10 text-red-400',
  info: 'border border-zinc-500/20 bg-[var(--text-primary)]/10 text-[var(--text-muted)]',
  brand: 'border border-zinc-500/20 bg-[var(--text-primary)]/10 text-[var(--text-muted)]',
};

const dotToneMap: Record<BadgeTone, string> = {
  default: 'bg-[var(--text-primary)]',
  success: 'bg-green-400',
  warning: 'bg-yellow-500',
  error: 'bg-red-400',
  info: 'bg-zinc-400',
  brand: 'bg-zinc-400',
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
        'inline-flex items-center gap-1.5 rounded-full text-xs font-medium',
        size === 'sm'
          ? 'px-2 py-0.5'
          : 'px-2 py-0.5',
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
