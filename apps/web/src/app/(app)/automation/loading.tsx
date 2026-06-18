import { Skeleton, SkeletonTable } from '@/components/ui/skeleton';

export default function AutomationLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton variant="button" />
      </div>
      <SkeletonTable rows={6} />
    </div>
  );
}
