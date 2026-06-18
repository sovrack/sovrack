import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36" />
        <Skeleton variant="button" />
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="space-y-4">
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <div className="flex gap-3 pt-2">
            <Skeleton variant="button" />
            <Skeleton variant="button" />
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="space-y-4">
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <div className="flex gap-3 pt-2">
            <Skeleton variant="button" />
            <Skeleton variant="button" />
          </div>
        </div>
      </div>
    </div>
  );
}
