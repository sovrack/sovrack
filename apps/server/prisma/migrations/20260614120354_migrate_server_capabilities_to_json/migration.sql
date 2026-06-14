/*
  Warnings:

  - You are about to drop the `ServerCapability` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ServerInstalledTool` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ServerCapability" DROP CONSTRAINT "ServerCapability_serverId_fkey";

-- DropForeignKey
ALTER TABLE "ServerInstalledTool" DROP CONSTRAINT "ServerInstalledTool_serverId_fkey";

-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "capabilities" JSONB DEFAULT '{}',
ADD COLUMN     "installedTools" JSONB DEFAULT '[]';

-- DropTable
DROP TABLE "ServerCapability";

-- DropTable
DROP TABLE "ServerInstalledTool";
