-- DropForeignKey
ALTER TABLE "DnsRecord" DROP CONSTRAINT "DnsRecord_environmentId_fkey";

-- DropForeignKey
ALTER TABLE "DnsRecord" DROP CONSTRAINT "DnsRecord_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "Domain" DROP CONSTRAINT "Domain_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "PipelineRun" DROP CONSTRAINT "PipelineRun_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "ProxyRule" DROP CONSTRAINT "ProxyRule_environmentId_fkey";

-- DropForeignKey
ALTER TABLE "ProxyRule" DROP CONSTRAINT "ProxyRule_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "Service" DROP CONSTRAINT "Service_environmentId_fkey";

-- DropForeignKey
ALTER TABLE "WebhookEndpoint" DROP CONSTRAINT "WebhookEndpoint_serviceId_fkey";

-- DropIndex
DROP INDEX "DnsRecord_environmentId_idx";

-- DropIndex
DROP INDEX "DnsRecord_serviceId_idx";

-- DropIndex
DROP INDEX "Domain_serviceId_idx";

-- DropIndex
DROP INDEX "ProxyRule_environmentId_idx";

-- DropIndex
DROP INDEX "ProxyRule_serviceId_idx";

-- DropIndex
DROP INDEX "Service_environmentId_idx";

-- DropIndex
DROP INDEX "Service_environmentId_name_key";

-- DropIndex
DROP INDEX "Volume_serviceId_idx";

-- DropIndex
DROP INDEX "WebhookEndpoint_serviceId_idx";

-- AlterTable
ALTER TABLE "Build" ADD COLUMN     "serviceEnvId" TEXT;

-- AlterTable
ALTER TABLE "Container" ADD COLUMN     "serviceEnvId" TEXT;

-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "serviceEnvId" TEXT;

-- AlterTable
ALTER TABLE "DnsRecord" DROP COLUMN "environmentId",
DROP COLUMN "serviceId",
ADD COLUMN     "serviceEnvId" TEXT;

-- AlterTable
ALTER TABLE "Domain" DROP COLUMN "serviceId",
ADD COLUMN     "serviceEnvId" TEXT;

-- AlterTable
ALTER TABLE "PipelineRun" DROP COLUMN "serviceId",
ADD COLUMN     "serviceEnvId" TEXT;

-- AlterTable
ALTER TABLE "ProxyRule" DROP COLUMN "environmentId",
DROP COLUMN "serviceId",
ADD COLUMN     "serviceEnvId" TEXT;

-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "environmentId" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "projectId" TEXT NOT NULL,
ALTER COLUMN "environmentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Volume" ADD COLUMN     "serviceEnvId" TEXT;

-- AlterTable
ALTER TABLE "WebhookEndpoint" DROP COLUMN "serviceId",
ADD COLUMN     "serviceEnvId" TEXT;

-- CreateTable
CREATE TABLE "ServiceEnvironment" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "branch" TEXT,
    "port" INTEGER,
    "startCommand" TEXT,
    "replicas" INTEGER,
    "healthcheckPath" TEXT,
    "repoUrl" TEXT,
    "buildPack" "BuildPack",
    "env" TEXT,

    CONSTRAINT "ServiceEnvironment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceEnvironment_environmentId_idx" ON "ServiceEnvironment"("environmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceEnvironment_serviceId_environmentId_key" ON "ServiceEnvironment"("serviceId", "environmentId");

-- CreateIndex
CREATE INDEX "Build_serviceEnvId_idx" ON "Build"("serviceEnvId");

-- CreateIndex
CREATE INDEX "Container_serviceEnvId_idx" ON "Container"("serviceEnvId");

-- CreateIndex
CREATE INDEX "Deployment_serviceEnvId_idx" ON "Deployment"("serviceEnvId");

-- CreateIndex
CREATE INDEX "DnsRecord_serviceEnvId_idx" ON "DnsRecord"("serviceEnvId");

-- CreateIndex
CREATE INDEX "Domain_serviceEnvId_idx" ON "Domain"("serviceEnvId");

-- CreateIndex
CREATE INDEX "PipelineRun_serviceEnvId_idx" ON "PipelineRun"("serviceEnvId");

-- CreateIndex
CREATE INDEX "ProxyRule_serviceEnvId_idx" ON "ProxyRule"("serviceEnvId");

-- CreateIndex
CREATE INDEX "Server_environmentId_idx" ON "Server"("environmentId");

-- CreateIndex
CREATE INDEX "Service_projectId_idx" ON "Service"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Service_projectId_name_key" ON "Service"("projectId", "name");

-- CreateIndex
CREATE INDEX "Volume_serviceEnvId_idx" ON "Volume"("serviceEnvId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_serviceEnvId_idx" ON "WebhookEndpoint"("serviceEnvId");

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEnvironment" ADD CONSTRAINT "ServiceEnvironment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEnvironment" ADD CONSTRAINT "ServiceEnvironment_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_serviceEnvId_fkey" FOREIGN KEY ("serviceEnvId") REFERENCES "ServiceEnvironment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Build" ADD CONSTRAINT "Build_serviceEnvId_fkey" FOREIGN KEY ("serviceEnvId") REFERENCES "ServiceEnvironment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Container" ADD CONSTRAINT "Container_serviceEnvId_fkey" FOREIGN KEY ("serviceEnvId") REFERENCES "ServiceEnvironment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Volume" ADD CONSTRAINT "Volume_serviceEnvId_fkey" FOREIGN KEY ("serviceEnvId") REFERENCES "ServiceEnvironment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProxyRule" ADD CONSTRAINT "ProxyRule_serviceEnvId_fkey" FOREIGN KEY ("serviceEnvId") REFERENCES "ServiceEnvironment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_serviceEnvId_fkey" FOREIGN KEY ("serviceEnvId") REFERENCES "ServiceEnvironment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DnsRecord" ADD CONSTRAINT "DnsRecord_serviceEnvId_fkey" FOREIGN KEY ("serviceEnvId") REFERENCES "ServiceEnvironment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_serviceEnvId_fkey" FOREIGN KEY ("serviceEnvId") REFERENCES "ServiceEnvironment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_serviceEnvId_fkey" FOREIGN KEY ("serviceEnvId") REFERENCES "ServiceEnvironment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

