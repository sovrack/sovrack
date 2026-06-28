-- CreateEnum
CREATE TYPE "ServerRunKind" AS ENUM ('PREPARATION', 'AUTOMATION');

-- CreateEnum
CREATE TYPE "ServerRunStatus" AS ENUM ('QUEUED', 'RESOLVING_OPTIONS', 'WAITING_FOR_LOCK', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'TIMEOUT', 'CANCELED');

-- CreateEnum
CREATE TYPE "ServerRunStepStatus" AS ENUM ('PENDING', 'SKIPPED', 'RUNNING', 'OK', 'CHANGED', 'SUCCEEDED', 'FAILED', 'TIMEOUT', 'CANCELED');

-- DropForeignKey
ALTER TABLE "ServerOperation" DROP CONSTRAINT "ServerOperation_requestedById_fkey";

-- DropForeignKey
ALTER TABLE "ServerOperation" DROP CONSTRAINT "ServerOperation_retryOfId_fkey";

-- DropForeignKey
ALTER TABLE "ServerOperationLog" DROP CONSTRAINT "ServerOperationLog_operationId_fkey";

-- DropForeignKey
ALTER TABLE "ServerOperationTarget" DROP CONSTRAINT "ServerOperationTarget_operationId_fkey";

-- DropForeignKey
ALTER TABLE "ServerOperationTarget" DROP CONSTRAINT "ServerOperationTarget_serverId_fkey";

-- DropForeignKey
ALTER TABLE "ServerPreparation" DROP CONSTRAINT "ServerPreparation_requestedById_fkey";

-- DropForeignKey
ALTER TABLE "ServerPreparation" DROP CONSTRAINT "ServerPreparation_retryOfPreparationId_fkey";

-- DropForeignKey
ALTER TABLE "ServerPreparation" DROP CONSTRAINT "ServerPreparation_serverId_fkey";

-- DropForeignKey
ALTER TABLE "ServerPreparationLog" DROP CONSTRAINT "ServerPreparationLog_preparationId_fkey";

-- DropForeignKey
ALTER TABLE "ServerPreparationTask" DROP CONSTRAINT "ServerPreparationTask_preparationId_fkey";

-- DropTable
DROP TABLE "ServerOperation";

-- DropTable
DROP TABLE "ServerOperationLog";

-- DropTable
DROP TABLE "ServerOperationTarget";

-- DropTable
DROP TABLE "ServerPreparation";

-- DropTable
DROP TABLE "ServerPreparationLog";

-- DropTable
DROP TABLE "ServerPreparationTask";

-- DropEnum
DROP TYPE "ServerOperationStatus";

-- DropEnum
DROP TYPE "ServerOperationTargetStatus";

-- DropEnum
DROP TYPE "ServerPreparationStatus";

-- DropEnum
DROP TYPE "ServerPreparationTaskStatus";

-- CreateTable
CREATE TABLE "ServerRun" (
    "id" TEXT NOT NULL,
    "kind" "ServerRunKind" NOT NULL,
    "serverId" TEXT,
    "actionKey" TEXT,
    "actionLabel" TEXT,
    "profile" TEXT,
    "status" "ServerRunStatus" NOT NULL DEFAULT 'QUEUED',
    "triggerSource" TEXT NOT NULL DEFAULT 'USER',
    "requestedById" TEXT,
    "paramsJson" JSONB NOT NULL DEFAULT '{}',
    "resolvedJson" JSONB,
    "summary" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "timeoutMs" INTEGER,
    "retryOfId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerRunStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "roleKey" TEXT,
    "serverId" TEXT,
    "taskName" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "status" "ServerRunStepStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "message" TEXT,
    "errorMessage" TEXT,
    "output" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerRunStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerRunLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "serverId" TEXT,
    "level" "ServerLogLevel" NOT NULL DEFAULT 'INFO',
    "source" TEXT NOT NULL DEFAULT 'orchestrator',
    "message" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerRun_serverId_status_idx" ON "ServerRun"("serverId", "status");

-- CreateIndex
CREATE INDEX "ServerRun_status_idx" ON "ServerRun"("status");

-- CreateIndex
CREATE INDEX "ServerRun_actionKey_idx" ON "ServerRun"("actionKey");

-- CreateIndex
CREATE INDEX "ServerRun_createdAt_idx" ON "ServerRun"("createdAt");

-- CreateIndex
CREATE INDEX "ServerRun_requestedById_idx" ON "ServerRun"("requestedById");

-- CreateIndex
CREATE INDEX "ServerRun_retryOfId_idx" ON "ServerRun"("retryOfId");

-- CreateIndex
CREATE INDEX "ServerRunStep_runId_orderIndex_idx" ON "ServerRunStep"("runId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ServerRunStep_runId_roleKey_key" ON "ServerRunStep"("runId", "roleKey");

-- CreateIndex
CREATE UNIQUE INDEX "ServerRunStep_runId_serverId_key" ON "ServerRunStep"("runId", "serverId");

-- CreateIndex
CREATE INDEX "ServerRunLog_runId_lineNumber_idx" ON "ServerRunLog"("runId", "lineNumber");

-- CreateIndex
CREATE INDEX "ServerRunLog_runId_createdAt_idx" ON "ServerRunLog"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "ServerRunLog_level_idx" ON "ServerRunLog"("level");

-- CreateIndex
CREATE INDEX "ServerRunLog_serverId_idx" ON "ServerRunLog"("serverId");

-- AddForeignKey
ALTER TABLE "ServerRun" ADD CONSTRAINT "ServerRun_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerRun" ADD CONSTRAINT "ServerRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerRun" ADD CONSTRAINT "ServerRun_retryOfId_fkey" FOREIGN KEY ("retryOfId") REFERENCES "ServerRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerRunStep" ADD CONSTRAINT "ServerRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ServerRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerRunStep" ADD CONSTRAINT "ServerRunStep_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerRunLog" ADD CONSTRAINT "ServerRunLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ServerRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

