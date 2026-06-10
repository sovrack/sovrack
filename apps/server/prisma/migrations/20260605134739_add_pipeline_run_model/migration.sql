-- CreateEnum
CREATE TYPE "PipelineRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELED', 'IGNORED');

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "externalId" BIGINT NOT NULL,
    "provider" "GitProviderType" NOT NULL,
    "status" "PipelineRunStatus" NOT NULL DEFAULT 'PENDING',
    "branch" TEXT,
    "commitSha" TEXT,
    "webUrl" TEXT,
    "imageSha" TEXT,
    "deploymentId" TEXT,
    "projectId" TEXT NOT NULL,
    "serviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineRun_deploymentId_idx" ON "PipelineRun"("deploymentId");

-- CreateIndex
CREATE INDEX "PipelineRun_projectId_status_idx" ON "PipelineRun"("projectId", "status");

-- CreateIndex
CREATE INDEX "PipelineRun_externalId_idx" ON "PipelineRun"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineRun_externalId_provider_key" ON "PipelineRun"("externalId", "provider");

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ProjectService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
