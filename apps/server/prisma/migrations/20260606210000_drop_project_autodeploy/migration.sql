-- autoDeploy is now single source of truth on Environment.
-- Drop the redundant, vestigial columns from Project.
ALTER TABLE "Project" DROP COLUMN IF EXISTS "autoDeploy";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "autoDeployBranch";
