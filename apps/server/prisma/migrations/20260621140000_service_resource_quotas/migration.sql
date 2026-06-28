-- Per-service resource quotas (multi-tenant safety). Nullable = unlimited.
ALTER TABLE "Service" ADD COLUMN "cpuLimit" DOUBLE PRECISION;
ALTER TABLE "Service" ADD COLUMN "memLimitMb" INTEGER;
