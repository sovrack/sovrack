-- Add per-deployment build strategy override + Nixpacks/Static config payloads.
-- This enables Coolify/Dokploy-style per-deployment build strategy selection.

ALTER TABLE "Deployment"
  ADD COLUMN IF NOT EXISTS "buildStrategy" "BuildStrategy" NOT NULL DEFAULT 'DOCKERFILE',
  ADD COLUMN IF NOT EXISTS "nixpacksConfig" JSONB,
  ADD COLUMN IF NOT EXISTS "staticConfig" JSONB;
