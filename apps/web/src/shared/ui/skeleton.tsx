import { clsx } from 'clsx';

type SkeletonProps = {
  className?: string;
  variant?: 'text' | 'card' | 'avatar' | 'button' | 'circle';
};

export function Skeleton({ className, variant = 'text' }: SkeletonProps) {
  const base = 'animate-pulse bg-[var(--border)] rounded-md';

  const variants: Record<string, string> = {
    text: 'h-4 w-full',
    card: 'h-40 w-full rounded-xl',
    avatar: 'h-10 w-10 rounded-full',
    button: 'h-9 w-24 rounded-xl',
    circle: 'h-14 w-14 rounded-full',
  };

  return <div className={clsx(base, variants[variant], className)} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-start gap-4">
        <Skeleton variant="avatar" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-2/5" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
      <div className="border-b border-[var(--border)] px-5 py-3">
        <Skeleton className="h-4 w-1/4" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-[var(--border)] px-5 py-4 last:border-0">
          <Skeleton variant="circle" className="h-8 w-8" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <Skeleton variant="button" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonGrid({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: cards }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
