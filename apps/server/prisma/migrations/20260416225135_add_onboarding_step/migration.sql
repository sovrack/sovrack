-- AlterTable
ALTER TABLE "public"."GitlabConfig" ALTER COLUMN "gitlabId" SET DATA TYPE BIGINT,
ALTER COLUMN "gitlabGroupId" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "public"."Pipeline" ALTER COLUMN "gitlabId" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "public"."Project" ALTER COLUMN "gitlabId" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "public"."Server" ADD COLUMN     "onboardingStep" TEXT NOT NULL DEFAULT 'PENDING';
