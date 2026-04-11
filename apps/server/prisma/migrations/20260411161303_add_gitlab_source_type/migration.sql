-- CreateEnum
CREATE TYPE "public"."GitlabSourceType" AS ENUM ('REPO', 'GROUP');

-- AlterTable
ALTER TABLE "public"."GitlabConfig" ADD COLUMN     "gitlabGroupId" INTEGER,
ADD COLUMN     "sourceType" "public"."GitlabSourceType" NOT NULL DEFAULT 'REPO',
ALTER COLUMN "gitlabId" DROP NOT NULL;
