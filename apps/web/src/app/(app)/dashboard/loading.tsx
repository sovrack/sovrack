import { Skeleton, SkeletonGrid } from "@/shared/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton variant="button" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-8 w-16" />
            <Skeleton className="mt-1 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-4 h-48 w-full" />
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-4 h-48 w-full" />
        </div>
      </div>
      <SkeletonGrid cards={3} />
    </div>
  );
}
