-- AlterTable
ALTER TABLE "public"."Environment" ADD COLUMN     "autoDeploy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoDeployBranch" TEXT;

-- AlterTable
ALTER TABLE "public"."Project" ADD COLUMN     "autoDeploy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoDeployBranch" TEXT,
ADD COLUMN     "buildPort" INTEGER,
ADD COLUMN     "buildStartCmd" TEXT,
ADD COLUMN     "dockerfileContent" TEXT,
ADD COLUMN     "gitlabCiContent" TEXT,
ADD COLUMN     "projectType" TEXT;
