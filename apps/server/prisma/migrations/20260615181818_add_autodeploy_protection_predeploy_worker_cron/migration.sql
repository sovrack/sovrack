-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ServiceType" ADD VALUE 'WORKER';
ALTER TYPE "ServiceType" ADD VALUE 'CRON';

-- AlterTable
ALTER TABLE "Environment" ADD COLUMN     "isProtected" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "preDeployCommand" TEXT,
ADD COLUMN     "preDeployTimeout" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "shutdownTimeout" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "ServiceEnvironment" ADD COLUMN     "autoBranch" TEXT DEFAULT 'main',
ADD COLUMN     "autoDeploy" BOOLEAN NOT NULL DEFAULT false;
