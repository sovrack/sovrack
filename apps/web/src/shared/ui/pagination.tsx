'use client';

import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function Pagination({ page, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const visible = pages.filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  );

  const withEllipsis: (number | '...')[] = [];
  let prev: number | null = null;
  for (const p of visible) {
    if (prev !== null && p - prev > 1) withEllipsis.push('...');
    withEllipsis.push(p);
    prev = p;
  }

  return (
    <div className={clsx('flex items-center justify-center gap-1', className)}>
      <button type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
      >
        <ChevronLeft size={16} />
      </button>

      {withEllipsis.map((item, idx) =>
        item === '...' ? (
          <span key={`e-${idx}`} className="px-1 text-sm text-[var(--text-muted)]">
            …
          </span>
        ) : (
          <button type="button"
            key={item}
            onClick={() => onPageChange(item)}
            className={clsx(
              'flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition',
              item === page
                ? 'bg-[var(--text-primary)] text-[var(--bg-app)] shadow'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text-primary)]',
            )}
          >
            {item}
          </button>
        ),
      )}

      <button type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
