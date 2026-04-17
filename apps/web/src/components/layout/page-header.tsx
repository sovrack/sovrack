import clsx from 'clsx';
import type { ReactNode } from 'react';

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={clsx('flex flex-wrap items-start justify-between gap-4', className)}>
      <div>
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-600">
            {eyebrow}
          </p>
        )}
        <h1 className={clsx('mt-2 font-semibold tracking-[-0.04em] text-slate-900 dark:text-slate-100', eyebrow ? 'text-3xl' : 'text-2xl')}>
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>

      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}