-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "autoHealReason" TEXT,
ADD COLUMN     "isAutoHealed" BOOLEAN NOT NULL DEFAULT false;
