-- Server Management / Prepare Server production domain.
-- Ansible remains on the control node; VPS targets are SSH-managed agentless hosts.

-- 1. Replace ServerStatus with explicit business workflow statuses.
ALTER TYPE "public"."ServerStatus" RENAME TO "ServerStatus_old";
CREATE TYPE "public"."ServerStatus" AS ENUM (
  'NEW',
  'SSH_PENDING',
  'SSH_VALIDATED',
  'VALIDATION_FAILED',
  'INFO_DETECTED',
  'PREPARATION_PENDING',
  'PREPARING',
  'PREPARED',
  'PARTIALLY_PREPARED',
  'PREPARATION_FAILED',
  'UNREACHABLE',
  'DISABLED'
);
ALTER TABLE "public"."Server" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."Server"
  ALTER COLUMN "status" TYPE "public"."ServerStatus"
  USING CASE "status"::text
    WHEN 'VERIFYING' THEN 'SSH_PENDING'::"public"."ServerStatus"
    WHEN 'VERIFIED' THEN 'SSH_VALIDATED'::"public"."ServerStatus"
    WHEN 'FAILED' THEN 'VALIDATION_FAILED'::"public"."ServerStatus"
    ELSE 'NEW'::"public"."ServerStatus"
  END;
ALTER TABLE "public"."Server" ALTER COLUMN "status" SET DEFAULT 'NEW';
DROP TYPE "public"."ServerStatus_old";

-- 2. New preparation domain enums.
CREATE TYPE "public"."ServerPreparationStatus" AS ENUM (
  'QUEUED',
  'RESOLVING_OPTIONS',
  'WAITING_FOR_LOCK',
  'RUNNING',
  'SUCCEEDED',
  'PARTIAL',
  'FAILED',
  'TIMEOUT',
  'CANCELED'
);

CREATE TYPE "public"."ServerPreparationTaskStatus" AS ENUM (
  'PENDING',
  'SKIPPED',
  'RUNNING',
  'OK',
  'CHANGED',
  'FAILED',
  'TIMEOUT'
);

CREATE TYPE "public"."ServerInstalledToolStatus" AS ENUM (
  'INSTALLED',
  'MISSING',
  'FAILED',
  'UNKNOWN'
);

CREATE TYPE "public"."ServerPreparationProfile" AS ENUM (
  'BASIC',
  'WEB',
  'DATABASE',
  'RUNNER',
  'FULL',
  'CUSTOM'
);

-- 3. Server transitional columns and removal of the false target-side Ansible flag.
ALTER TABLE "public"."Server"
  ADD COLUMN "lastDetectedAt" TIMESTAMP(3),
  ADD COLUMN "lastPreparedAt" TIMESTAMP(3);

ALTER TABLE "public"."Server" DROP COLUMN IF EXISTS "hasAnsible";

-- 4. Validation, capabilities and installed tools.
CREATE TABLE "public"."ServerValidationResult" (
  "id" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "sshReachable" BOOLEAN NOT NULL DEFAULT false,
  "authSucceeded" BOOLEAN NOT NULL DEFAULT false,
  "sudoAvailable" BOOLEAN NOT NULL DEFAULT false,
  "fingerprint" TEXT,
  "osName" TEXT,
  "osVersion" TEXT,
  "architecture" TEXT,
  "pythonAvailable" BOOLEAN NOT NULL DEFAULT false,
  "validationMessage" TEXT,
  "validatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServerValidationResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."ServerCapability" (
  "id" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServerCapability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."ServerInstalledTool" (
  "id" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "toolKey" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "version" TEXT,
  "installedBy" TEXT,
  "status" "public"."ServerInstalledToolStatus" NOT NULL DEFAULT 'UNKNOWN',
  "installedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServerInstalledTool_pkey" PRIMARY KEY ("id")
);

-- 5. Preparation aggregate, per-role tasks and log stream.
CREATE TABLE "public"."ServerPreparation" (
  "id" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "status" "public"."ServerPreparationStatus" NOT NULL DEFAULT 'QUEUED',
  "profile" "public"."ServerPreparationProfile" NOT NULL DEFAULT 'CUSTOM',
  "triggerSource" TEXT NOT NULL DEFAULT 'USER',
  "requestedById" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "selectedOptionsJson" JSONB NOT NULL,
  "resolvedRolesJson" JSONB NOT NULL,
  "summary" TEXT,
  "errorMessage" TEXT,
  "retryOfPreparationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServerPreparation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."ServerPreparationTask" (
  "id" TEXT NOT NULL,
  "preparationId" TEXT NOT NULL,
  "roleKey" TEXT NOT NULL,
  "taskName" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "status" "public"."ServerPreparationTaskStatus" NOT NULL DEFAULT 'PENDING',
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServerPreparationTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."ServerPreparationLog" (
  "id" TEXT NOT NULL,
  "preparationId" TEXT NOT NULL,
  "level" "public"."ServerLogLevel" NOT NULL DEFAULT 'INFO',
  "source" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServerPreparationLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."ServerAuditEvent" (
  "id" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "actorId" TEXT,
  "eventType" TEXT NOT NULL,
  "payloadJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServerAuditEvent_pkey" PRIMARY KEY ("id")
);

-- 6. Indexes and constraints.
CREATE INDEX "ServerValidationResult_serverId_createdAt_idx" ON "public"."ServerValidationResult"("serverId", "createdAt");
CREATE INDEX "ServerValidationResult_serverId_validatedAt_idx" ON "public"."ServerValidationResult"("serverId", "validatedAt");

CREATE UNIQUE INDEX "ServerCapability_serverId_key_key" ON "public"."ServerCapability"("serverId", "key");
CREATE INDEX "ServerCapability_serverId_detectedAt_idx" ON "public"."ServerCapability"("serverId", "detectedAt");

CREATE UNIQUE INDEX "ServerInstalledTool_serverId_toolKey_key" ON "public"."ServerInstalledTool"("serverId", "toolKey");
CREATE INDEX "ServerInstalledTool_serverId_status_idx" ON "public"."ServerInstalledTool"("serverId", "status");

CREATE INDEX "ServerPreparation_serverId_status_idx" ON "public"."ServerPreparation"("serverId", "status");
CREATE INDEX "ServerPreparation_serverId_createdAt_idx" ON "public"."ServerPreparation"("serverId", "createdAt");
CREATE INDEX "ServerPreparation_requestedById_idx" ON "public"."ServerPreparation"("requestedById");
CREATE INDEX "ServerPreparation_retryOfPreparationId_idx" ON "public"."ServerPreparation"("retryOfPreparationId");

CREATE INDEX "ServerPreparationTask_preparationId_orderIndex_idx" ON "public"."ServerPreparationTask"("preparationId", "orderIndex");
CREATE UNIQUE INDEX "ServerPreparationTask_preparationId_roleKey_key" ON "public"."ServerPreparationTask"("preparationId", "roleKey");

CREATE INDEX "ServerPreparationLog_preparationId_lineNumber_idx" ON "public"."ServerPreparationLog"("preparationId", "lineNumber");
CREATE INDEX "ServerPreparationLog_preparationId_createdAt_idx" ON "public"."ServerPreparationLog"("preparationId", "createdAt");
CREATE INDEX "ServerPreparationLog_level_idx" ON "public"."ServerPreparationLog"("level");

CREATE INDEX "ServerAuditEvent_serverId_createdAt_idx" ON "public"."ServerAuditEvent"("serverId", "createdAt");
CREATE INDEX "ServerAuditEvent_actorId_createdAt_idx" ON "public"."ServerAuditEvent"("actorId", "createdAt");
CREATE INDEX "ServerAuditEvent_eventType_idx" ON "public"."ServerAuditEvent"("eventType");

ALTER TABLE "public"."ServerValidationResult" ADD CONSTRAINT "ServerValidationResult_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "public"."Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ServerCapability" ADD CONSTRAINT "ServerCapability_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "public"."Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ServerInstalledTool" ADD CONSTRAINT "ServerInstalledTool_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "public"."Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ServerPreparation" ADD CONSTRAINT "ServerPreparation_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "public"."Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ServerPreparation" ADD CONSTRAINT "ServerPreparation_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."ServerPreparation" ADD CONSTRAINT "ServerPreparation_retryOfPreparationId_fkey" FOREIGN KEY ("retryOfPreparationId") REFERENCES "public"."ServerPreparation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."ServerPreparationTask" ADD CONSTRAINT "ServerPreparationTask_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "public"."ServerPreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ServerPreparationLog" ADD CONSTRAINT "ServerPreparationLog_preparationId_fkey" FOREIGN KEY ("preparationId") REFERENCES "public"."ServerPreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ServerAuditEvent" ADD CONSTRAINT "ServerAuditEvent_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "public"."Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ServerAuditEvent" ADD CONSTRAINT "ServerAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
