-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "AutomationTargetStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'TIMEOUT');

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "actionLabel" TEXT NOT NULL,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'QUEUED',
    "summary" TEXT,
    "errorMessage" TEXT,
    "extraVarsJson" JSONB NOT NULL DEFAULT '{}',
    "requestedById" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRunTarget" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "status" "AutomationTargetStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "ansibleOutput" TEXT,

    CONSTRAINT "AutomationRunTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRunLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "serverId" TEXT,
    "level" "ServerLogLevel" NOT NULL DEFAULT 'INFO',
    "source" TEXT NOT NULL DEFAULT 'orchestrator',
    "message" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationRun_status_idx" ON "AutomationRun"("status");
CREATE INDEX "AutomationRun_actionKey_idx" ON "AutomationRun"("actionKey");
CREATE INDEX "AutomationRun_createdAt_idx" ON "AutomationRun"("createdAt");
CREATE UNIQUE INDEX "AutomationRunTarget_runId_serverId_key" ON "AutomationRunTarget"("runId", "serverId");
CREATE INDEX "AutomationRunTarget_runId_idx" ON "AutomationRunTarget"("runId");
CREATE INDEX "AutomationRunTarget_serverId_idx" ON "AutomationRunTarget"("serverId");
CREATE INDEX "AutomationRunLog_runId_lineNumber_idx" ON "AutomationRunLog"("runId", "lineNumber");

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationRunTarget" ADD CONSTRAINT "AutomationRunTarget_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRunTarget" ADD CONSTRAINT "AutomationRunTarget_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRunLog" ADD CONSTRAINT "AutomationRunLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
