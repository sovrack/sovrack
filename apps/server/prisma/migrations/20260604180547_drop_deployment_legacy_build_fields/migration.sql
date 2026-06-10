/*
  Warnings:

  - You are about to drop the column `buildLog` on the `Deployment` table. All the data in the column will be lost.
  - You are about to drop the column `buildMode` on the `Deployment` table. All the data in the column will be lost.
  - You are about to drop the column `buildStatus` on the `Deployment` table. All the data in the column will be lost.
  - You are about to drop the column `buildStrategy` on the `Deployment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Deployment" DROP COLUMN "buildLog",
DROP COLUMN "buildMode",
DROP COLUMN "buildStatus",
DROP COLUMN "buildStrategy";

-- DropEnum
DROP TYPE "BuildMode";
