-- CreateEnum
CREATE TYPE "BuildPack" AS ENUM ('NIXPACKS', 'BUILDPACK', 'DOCKERFILE', 'DOCKER_COMPOSE', 'STATIC', 'NONE');

-- CreateEnum
CREATE TYPE "BuildTrigger" AS ENUM ('MANUAL', 'WEBHOOK', 'API', 'RETRY', 'ROLLBACK');

-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "buildId" TEXT;

-- CreateTable
CREATE TABLE "Build" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "serviceId" TEXT,
    "branch" TEXT NOT NULL,
    "commitSha" TEXT,
    "buildPack" "BuildPack" NOT NULL,
    "status" "BuildStatus" NOT NULL DEFAULT 'NOT_BUILT',
    "triggeredBy" "BuildTrigger" NOT NULL DEFAULT 'MANUAL',
    "imageSha" TEXT,
    "releaseDir" TEXT,
    "registryUrl" TEXT,
    "imageRepository" TEXT,
    "imageTag" TEXT,
    "logs" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "gitlabPipelineId" BIGINT,
    "nixpacksConfig" JSONB,
    "staticConfig" JSONB,
    "errorMessage" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Build_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Build_projectId_status_idx" ON "Build"("projectId", "status");

-- CreateIndex
CREATE INDEX "Build_projectId_branch_createdAt_idx" ON "Build"("projectId", "branch", "createdAt");

-- CreateIndex
CREATE INDEX "Build_commitSha_idx" ON "Build"("commitSha");

-- CreateIndex
CREATE INDEX "Build_imageSha_idx" ON "Build"("imageSha");

-- CreateIndex
CREATE INDEX "Build_status_createdAt_idx" ON "Build"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Build_serviceId_idx" ON "Build"("serviceId");

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Build" ADD CONSTRAINT "Build_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Build" ADD CONSTRAINT "Build_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ProjectService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Build" ADD CONSTRAINT "Build_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
