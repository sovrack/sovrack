-- Immutable Release model: freeze the desired state (specSnapshot) and the
-- concrete bindings (resolvedRefs) on each Deployment. Additive, nullable.
ALTER TABLE "Deployment" ADD COLUMN "specSnapshot" JSONB;
ALTER TABLE "Deployment" ADD COLUMN "resolvedRefs" JSONB;
