-- CreateEnum
CREATE TYPE "ServerInfraRole" AS ENUM ('STAGING', 'PRODUCTION');

-- AlterEnum
ALTER TYPE "GitProviderType" ADD VALUE 'GITHUB';

-- DropForeignKey
ALTER TABLE "Pipeline" DROP CONSTRAINT "Pipeline_projectId_fkey";

-- AlterTable
ALTER TABLE "GitlabConfig" ADD COLUMN     "lastPolledPipelineId" BIGINT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "nixpacksConfig" JSONB,
ADD COLUMN     "staticConfig" JSONB;

-- AlterTable
ALTER TABLE "ProjectService" ADD COLUMN     "dockerComposeContent" TEXT,
ADD COLUMN     "nixpacksConfig" JSONB,
ADD COLUMN     "staticConfig" JSONB;

-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "infraRole" "ServerInfraRole";

-- CreateTable
CREATE TABLE "EnvironmentConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "environmentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvironmentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnvironmentConfig_environmentId_idx" ON "EnvironmentConfig"("environmentId");

-- CreateIndex
CREATE UNIQUE INDEX "EnvironmentConfig_projectId_environmentId_key_key" ON "EnvironmentConfig"("projectId", "environmentId", "key");

-- AddForeignKey
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentConfig" ADD CONSTRAINT "EnvironmentConfig_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentConfig" ADD CONSTRAINT "EnvironmentConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
