-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "isRollback" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rolledBackAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProjectService" ADD COLUMN     "rootDir" TEXT DEFAULT '/',
ADD COLUMN     "setupComplete" BOOLEAN NOT NULL DEFAULT false;
