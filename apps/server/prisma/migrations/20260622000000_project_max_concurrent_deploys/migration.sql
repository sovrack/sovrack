-- Multi-tenant fair-share: per-project cap on simultaneous in-flight deploys.
-- Nullable = unlimited. Additive, non-destructive (no data backfill needed).
ALTER TABLE "Project" ADD COLUMN "maxConcurrentDeploys" INTEGER;
