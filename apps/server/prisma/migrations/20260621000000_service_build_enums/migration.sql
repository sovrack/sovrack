-- Convert Service.buildMode and Service.deployTrigger from free String to enums.
--
-- Prisma's auto-generated diff for this change uses DROP COLUMN + ADD COLUMN,
-- which would WIPE existing values. This migration instead uses ALTER COLUMN ...
-- TYPE ... USING (...) so the data is preserved (every existing value already
-- matches an enum label: LOCAL / PUSH / PIPELINE_SUCCESS). NULLs stay NULL.

-- CreateEnum
CREATE TYPE "DeployTrigger" AS ENUM ('PUSH', 'PIPELINE_SUCCESS', 'CI_HOOK', 'MANUAL');

-- CreateEnum
CREATE TYPE "BuildMode" AS ENUM ('LOCAL', 'REGISTRY');

-- AlterColumn: Service.buildMode (String -> BuildMode), data-preserving
ALTER TABLE "Service" ALTER COLUMN "buildMode" DROP DEFAULT;
ALTER TABLE "Service" ALTER COLUMN "buildMode" TYPE "BuildMode" USING ("buildMode"::"BuildMode");
ALTER TABLE "Service" ALTER COLUMN "buildMode" SET DEFAULT 'LOCAL';

-- AlterColumn: Service.deployTrigger (String -> DeployTrigger), data-preserving
ALTER TABLE "Service" ALTER COLUMN "deployTrigger" DROP DEFAULT;
ALTER TABLE "Service" ALTER COLUMN "deployTrigger" TYPE "DeployTrigger" USING ("deployTrigger"::"DeployTrigger");
ALTER TABLE "Service" ALTER COLUMN "deployTrigger" SET DEFAULT 'PIPELINE_SUCCESS';
