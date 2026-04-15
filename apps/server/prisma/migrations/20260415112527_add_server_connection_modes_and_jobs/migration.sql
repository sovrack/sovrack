-- CreateEnum
CREATE TYPE "public"."ServerConnectionMode" AS ENUM ('SSH', 'BASTION', 'AGENT');

-- CreateEnum
CREATE TYPE "public"."ServerJobType" AS ENUM ('VERIFY', 'INSTALL_TOOLS', 'REGISTER_RUNNER');

-- CreateEnum
CREATE TYPE "public"."ServerJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'BLOCKED', 'AGENT_PENDING');

-- AlterTable
ALTER TABLE "public"."Server" ADD COLUMN     "agentLastSeenAt" TIMESTAMP(3),
ADD COLUMN     "agentTokenHash" TEXT,
ADD COLUMN     "bastionHost" TEXT,
ADD COLUMN     "bastionPort" INTEGER,
ADD COLUMN     "bastionSshKey" TEXT,
ADD COLUMN     "bastionUsername" TEXT,
ADD COLUMN     "connectionMode" "public"."ServerConnectionMode" NOT NULL DEFAULT 'SSH';

-- CreateTable
CREATE TABLE "public"."ServerJob" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "type" "public"."ServerJobType" NOT NULL,
    "status" "public"."ServerJobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "output" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "timeoutMs" INTEGER NOT NULL DEFAULT 45000,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerJob_serverId_status_idx" ON "public"."ServerJob"("serverId", "status");

-- CreateIndex
CREATE INDEX "ServerJob_createdAt_idx" ON "public"."ServerJob"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."ServerJob" ADD CONSTRAINT "ServerJob_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "public"."Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
