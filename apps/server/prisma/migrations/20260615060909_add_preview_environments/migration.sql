-- AlterTable
ALTER TABLE "ServiceEnvironment" ADD COLUMN     "isPreview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "previewBranch" TEXT,
ADD COLUMN     "previewMrId" TEXT;
