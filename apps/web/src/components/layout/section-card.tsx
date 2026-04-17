import clsx from 'clsx';
import type { ReactNode } from 'react';

type SectionCardProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: SectionCardProps) {
  return (
    <section
      className={clsx(
        'rounded-2xl border border-slate-200 bg-white shadow-theme-xs dark:border-slate-700 dark:bg-slate-900',
        className,
      )}
    >
      {(title || description || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            {title && <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-900 dark:text-slate-100">{title}</h2>}
            {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      <div className={clsx('px-5 py-5 sm:px-6', contentClassName)}>{children}</div>
    </section>
  );
}