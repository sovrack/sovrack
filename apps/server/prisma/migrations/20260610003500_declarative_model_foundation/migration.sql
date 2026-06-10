-- Declarative model foundation (additive, all nullable):
--  B. Application declares abstract dependencies
ALTER TABLE "ProjectService" ADD COLUMN "needs" JSONB;
--  C. Environment binds capabilities -> concrete infra
ALTER TABLE "EnvironmentServiceTarget" ADD COLUMN "bindings" JSONB;
--  E. Reconciliation status on the immutable Release
ALTER TABLE "Deployment" ADD COLUMN "conditions" JSONB;
ALTER TABLE "Deployment" ADD COLUMN "observedGeneration" INTEGER;
