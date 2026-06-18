-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('APPLICATION', 'DATABASE', 'COMPOSE');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('GIT', 'DOCKER_IMAGE', 'NONE');

-- DropForeignKey
ALTER TABLE "Build" DROP CONSTRAINT "Build_userId_fkey";

-- DropForeignKey
ALTER TABLE "Deployment" DROP CONSTRAINT "Deployment_userId_fkey";

-- AlterTable
ALTER TABLE "Build" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Deployment" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Domain" ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "Environment" ADD COLUMN     "env" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "env" TEXT;

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ServiceType" NOT NULL DEFAULT 'APPLICATION',
    "description" TEXT,
    "sourceType" "SourceType" DEFAULT 'GIT',
    "repoUrl" TEXT,
    "branch" TEXT DEFAULT 'main',
    "providerId" TEXT,
    "rootDir" TEXT DEFAULT '/',
    "buildPack" "BuildPack" DEFAULT 'DOCKERFILE',
    "buildType" TEXT,
    "dockerfile" TEXT,
    "port" INTEGER DEFAULT 3000,
    "startCommand" TEXT,
    "buildArgs" JSONB,
    "nixpacksConfig" JSONB,
    "staticConfig" JSONB,
    "dockerComposeContent" TEXT,
    "composeServiceName" TEXT,
    "databaseType" "ManagedServiceType",
    "databaseVersion" TEXT DEFAULT 'latest',
    "databaseCredentials" JSONB,
    "env" TEXT,
    "healthcheckPath" TEXT,
    "replicas" INTEGER NOT NULL DEFAULT 1,
    "environmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Service_environmentId_idx" ON "Service"("environmentId");

-- CreateIndex
CREATE INDEX "Service_providerId_idx" ON "Service"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "Service_environmentId_name_key" ON "Service"("environmentId", "name");

-- CreateIndex
CREATE INDEX "Build_userId_idx" ON "Build"("userId");

-- CreateIndex
CREATE INDEX "Deployment_status_updatedAt_idx" ON "Deployment"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Deployment_environmentId_status_idx" ON "Deployment"("environmentId", "status");

-- CreateIndex
CREATE INDEX "Deployment_userId_idx" ON "Deployment"("userId");

-- CreateIndex
CREATE INDEX "Domain_serviceId_idx" ON "Domain"("serviceId");

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Build" ADD CONSTRAINT "Build_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
