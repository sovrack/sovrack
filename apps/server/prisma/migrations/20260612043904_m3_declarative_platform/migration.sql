-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ServiceType" ADD VALUE 'WEB_SERVICE';
ALTER TYPE "ServiceType" ADD VALUE 'WORKER';
ALTER TYPE "ServiceType" ADD VALUE 'CRON_JOB';
ALTER TYPE "ServiceType" ADD VALUE 'CACHE';
ALTER TYPE "ServiceType" ADD VALUE 'QUEUE';

-- DropIndex
DROP INDEX "Deployment_gitlabPipelineId_idx";

-- DropIndex
DROP INDEX "Deployment_projectId_environmentId_gitlabPipelineId_idx";

-- DropIndex
DROP INDEX "GitProviderRepo_externalRepoIdBig_idx";

-- DropIndex
DROP INDEX "GitProviderRepo_externalRepoId_idx";

-- DropIndex
DROP INDEX "GitProviderRepo_providerId_repoFullName_key";

-- AlterTable
ALTER TABLE "Build" DROP COLUMN "gitlabPipelineId",
ADD COLUMN     "externalPipelineId" BIGINT;

-- AlterTable
ALTER TABLE "Deployment" DROP COLUMN "gitlabPipelineId",
ADD COLUMN     "externalPipelineId" BIGINT;

-- AlterTable
ALTER TABLE "GitProviderConfig" DROP COLUMN "gitlabUrl",
ADD COLUMN     "providerUrl" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "GitProviderRepo" DROP COLUMN "externalRepoId",
DROP COLUMN "externalRepoIdBig",
DROP COLUMN "repoFullName",
ADD COLUMN     "repoPath" TEXT NOT NULL,
ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "Service" DROP COLUMN "environmentId",
DROP COLUMN "repoUrl",
ADD COLUMN     "repoPath" TEXT;

-- AlterTable
ALTER TABLE "ServiceEnvironment" DROP COLUMN "repoUrl",
ADD COLUMN     "repoPath" TEXT;

-- CreateIndex
CREATE INDEX "AutomationRun_requestedById_idx" ON "AutomationRun"("requestedById");

-- CreateIndex
CREATE INDEX "AutomationRunLog_serverId_idx" ON "AutomationRunLog"("serverId");

-- CreateIndex
CREATE INDEX "Container_serverId_deploymentId_idx" ON "Container"("serverId", "deploymentId");

-- CreateIndex
CREATE INDEX "Deployment_externalPipelineId_idx" ON "Deployment"("externalPipelineId");

-- CreateIndex
CREATE INDEX "Deployment_projectId_environmentId_externalPipelineId_idx" ON "Deployment"("projectId", "environmentId", "externalPipelineId");

-- CreateIndex
CREATE INDEX "Deployment_serviceEnvId_status_createdAt_idx" ON "Deployment"("serviceEnvId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Deployment_previousDeploymentId_idx" ON "Deployment"("previousDeploymentId");

-- CreateIndex
CREATE INDEX "GitProviderRepo_serviceId_idx" ON "GitProviderRepo"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "GitProviderRepo_providerId_repoPath_key" ON "GitProviderRepo"("providerId", "repoPath");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_projectId_idx" ON "ProjectMember"("userId", "projectId");

-- CreateIndex
CREATE INDEX "Volume_serviceId_idx" ON "Volume"("serviceId");

-- AddForeignKey
ALTER TABLE "GitProviderRepo" ADD CONSTRAINT "GitProviderRepo_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "GitProviderConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

