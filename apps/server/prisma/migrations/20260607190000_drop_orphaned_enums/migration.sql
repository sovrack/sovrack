-- Drop orphaned enum types no longer referenced by any model.
--   * "EnvName"        — Environment.name is now a free-form String.
--   * "PipelineStatus" — the legacy Pipeline model was replaced by
--                        PipelineRun (which uses PipelineRunStatus).
-- Guarded with IF EXISTS so the migration is idempotent across environments
-- where the type may already have been dropped.
DROP TYPE IF EXISTS "public"."EnvName";
DROP TYPE IF EXISTS "public"."PipelineStatus";
