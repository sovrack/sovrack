-- Environment soft-delete: add a nullable archivedAt so deleting an environment
-- archives it (preserving Deployment history that cascades from it) instead of
-- hard-deleting. Nullable ADD COLUMN = data-preserving, no backfill needed.
ALTER TABLE "Environment" ADD COLUMN "archivedAt" TIMESTAMP(3);
