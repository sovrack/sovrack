import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

type AlertTone = 'error' | 'success' | 'warning' | 'info';

type AlertProps = {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
  className?: string;
};

const config: Record<
  AlertTone,
  { icon: typeof Info; border: string; bg: string; text: string; title: string }
> = {
  error: {
    icon: XCircle,
    border: 'border-red-500/20',
    bg: 'bg-red-500/5',
    text: 'text-red-400',
    title: 'text-red-400',
  },
  success: {
    icon: CheckCircle2,
    border: 'border-green-500/20',
    bg: 'bg-green-500/5',
    text: 'text-green-400',
    title: 'text-green-400',
  },
  warning: {
    icon: AlertTriangle,
    border: 'border-yellow-500/20',
    bg: 'bg-yellow-500/5',
    text: 'text-yellow-500',
    title: 'text-yellow-500',
  },
  info: {
    icon: Info,
    border: 'border-zinc-500/20',
    bg: 'bg-[var(--text-primary)]/5',
    text: 'text-[var(--text-muted)]',
    title: 'text-[var(--text-muted)]',
  },
};

export function Alert({ tone = 'error', title, children, className }: AlertProps) {
  const { icon: Icon, border, bg, text, title: titleColor } = config[tone];

  return (
    <div
      className={clsx(
        'flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm',
        tone === 'warning' && 'border-l-2 border-l-yellow-500',
        tone === 'error' && 'border-l-2 border-l-red-500',
        border,
        bg,
        text,
        className,
      )}
    >
      <Icon size={15} className="mt-0.5 shrink-0" />
      <div>
        {title && <p className={clsx('font-semibold', titleColor)}>{title}</p>}
        <div className={title ? 'mt-0.5' : ''}>{children}</div>
      </div>
    </div>
  );
}
