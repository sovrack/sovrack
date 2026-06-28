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
        'rounded-lg border border-[var(--border)] bg-[var(--bg-card)] shadow-sm',
        className,
      )}
    >
      {(title || description || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            {title && (
              <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      <div className={clsx('px-5 py-5 sm:px-6', contentClassName)}>{children}</div>
    </section>
  );
}
