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
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {eyebrow}
          </p>
        )}
        <h1
          className={clsx(
            'font-bold tracking-[-0.03em] text-[var(--text-primary)]',
            eyebrow ? 'text-2xl' : 'text-xl',
          )}
        >
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
        )}
      </div>

      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
