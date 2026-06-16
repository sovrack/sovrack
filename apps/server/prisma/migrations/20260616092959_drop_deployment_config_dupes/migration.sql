/*
  Warnings:

  - You are about to drop the column `nixpacksConfig` on the `Deployment` table. All the data in the column will be lost.
  - You are about to drop the column `staticConfig` on the `Deployment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Deployment" DROP COLUMN "nixpacksConfig",
DROP COLUMN "staticConfig";
