import { Skeleton, SkeletonGrid } from '@/components/ui/skeleton';

export default function MonitoringLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-2">
          <Skeleton variant="button" />
          <Skeleton variant="button" />
        </div>
      </div>
      <SkeletonGrid cards={6} />
    </div>
  );
}
