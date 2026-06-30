import { Skeleton, SkeletonGrid } from "@/shared/ui/skeleton";

export default function ProjectsLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton variant="button" />
      </div>
      <SkeletonGrid cards={6} />
    </div>
  );
}
