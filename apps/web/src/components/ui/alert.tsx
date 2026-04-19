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

const config: Record<AlertTone, { icon: typeof Info; border: string; bg: string; text: string; title: string }> = {
  error: { icon: XCircle, border: 'border-red-200', bg: 'bg-red-50', text: 'text-red-700', title: 'text-red-800' },
  success: { icon: CheckCircle2, border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700', title: 'text-emerald-800' },
  warning: { icon: AlertTriangle, border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700', title: 'text-amber-800' },
  info: { icon: Info, border: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700', title: 'text-blue-800' },
};

export function Alert({ tone = 'error', title, children, className }: AlertProps) {
  const { icon: Icon, border, bg, text, title: titleColor } = config[tone];

  return (
    <div
      className={clsx(
        'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
        border,
        bg,
        text,
        className,
      )}
    >
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div>
        {title && <p className={clsx('font-semibold', titleColor)}>{title}</p>}
        <div className={title ? 'mt-0.5' : ''}>{children}</div>
      </div>
    </div>
  );
}
