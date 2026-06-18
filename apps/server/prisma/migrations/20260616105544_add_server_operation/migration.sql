-- CreateEnum
CREATE TYPE "ServerOperationStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "ServerOperation" (
    "id" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "actionLabel" TEXT,
    "status" "ServerOperationStatus" NOT NULL DEFAULT 'QUEUED',
    "triggerSource" TEXT NOT NULL DEFAULT 'USER',
    "profile" TEXT,
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

    CONSTRAINT "ServerOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerOperationTarget" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "status" "ServerOperationStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "output" TEXT,

    CONSTRAINT "ServerOperationTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerOperationStep" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "roleKey" TEXT,
    "name" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "status" "ServerOperationStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "message" TEXT,

    CONSTRAINT "ServerOperationStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerOperationLog" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "serverId" TEXT,
    "level" "ServerLogLevel" NOT NULL DEFAULT 'INFO',
    "source" TEXT NOT NULL DEFAULT 'orchestrator',
    "message" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerOperationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerOperation_status_idx" ON "ServerOperation"("status");

-- CreateIndex
CREATE INDEX "ServerOperation_actionKey_idx" ON "ServerOperation"("actionKey");

-- CreateIndex
CREATE INDEX "ServerOperation_createdAt_idx" ON "ServerOperation"("createdAt");

-- CreateIndex
CREATE INDEX "ServerOperation_requestedById_idx" ON "ServerOperation"("requestedById");

-- CreateIndex
CREATE INDEX "ServerOperation_retryOfId_idx" ON "ServerOperation"("retryOfId");

-- CreateIndex
CREATE INDEX "ServerOperationTarget_operationId_idx" ON "ServerOperationTarget"("operationId");

-- CreateIndex
CREATE INDEX "ServerOperationTarget_serverId_idx" ON "ServerOperationTarget"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerOperationTarget_operationId_serverId_key" ON "ServerOperationTarget"("operationId", "serverId");

-- CreateIndex
CREATE INDEX "ServerOperationStep_operationId_orderIndex_idx" ON "ServerOperationStep"("operationId", "orderIndex");

-- CreateIndex
CREATE INDEX "ServerOperationLog_operationId_lineNumber_idx" ON "ServerOperationLog"("operationId", "lineNumber");

-- CreateIndex
CREATE INDEX "ServerOperationLog_serverId_idx" ON "ServerOperationLog"("serverId");

-- AddForeignKey
ALTER TABLE "ServerOperation" ADD CONSTRAINT "ServerOperation_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerOperation" ADD CONSTRAINT "ServerOperation_retryOfId_fkey" FOREIGN KEY ("retryOfId") REFERENCES "ServerOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerOperationTarget" ADD CONSTRAINT "ServerOperationTarget_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "ServerOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerOperationTarget" ADD CONSTRAINT "ServerOperationTarget_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerOperationStep" ADD CONSTRAINT "ServerOperationStep_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "ServerOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerOperationLog" ADD CONSTRAINT "ServerOperationLog_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "ServerOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
