-- Migration: remove BASTION and AGENT connection modes, keep SSH only
-- Also removes AGENT_PENDING from ServerJobStatus

-- 1. Migrate any existing BASTION/AGENT servers to SSH
UPDATE "public"."Server" SET "connectionMode" = 'SSH' WHERE "connectionMode" IN ('BASTION', 'AGENT');

-- 2. Migrate any AGENT_PENDING jobs to PENDING
UPDATE "public"."ServerJob" SET "status" = 'PENDING' WHERE "status" = 'AGENT_PENDING';

-- 3. Replace ServerConnectionMode enum (SSH only)
ALTER TYPE "public"."ServerConnectionMode" RENAME TO "ServerConnectionMode_old";
CREATE TYPE "public"."ServerConnectionMode" AS ENUM ('SSH');
ALTER TABLE "public"."Server" ALTER COLUMN "connectionMode" DROP DEFAULT;
ALTER TABLE "public"."Server" ALTER COLUMN "connectionMode" TYPE "public"."ServerConnectionMode" USING "connectionMode"::text::"public"."ServerConnectionMode";
ALTER TABLE "public"."Server" ALTER COLUMN "connectionMode" SET DEFAULT 'SSH';
DROP TYPE "public"."ServerConnectionMode_old";

-- 4. Replace ServerJobStatus enum (remove AGENT_PENDING)
ALTER TYPE "public"."ServerJobStatus" RENAME TO "ServerJobStatus_old";
CREATE TYPE "public"."ServerJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'BLOCKED');
ALTER TABLE "public"."ServerJob" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."ServerJob" ALTER COLUMN "status" TYPE "public"."ServerJobStatus" USING "status"::text::"public"."ServerJobStatus";
ALTER TABLE "public"."ServerJob" ALTER COLUMN "status" SET DEFAULT 'PENDING';
DROP TYPE "public"."ServerJobStatus_old";

-- 5. Drop bastion and agent columns from Server
ALTER TABLE "public"."Server" DROP COLUMN IF EXISTS "bastionHost";
ALTER TABLE "public"."Server" DROP COLUMN IF EXISTS "bastionPort";
ALTER TABLE "public"."Server" DROP COLUMN IF EXISTS "bastionUsername";
ALTER TABLE "public"."Server" DROP COLUMN IF EXISTS "bastionSshKey";
ALTER TABLE "public"."Server" DROP COLUMN IF EXISTS "agentTokenHash";
ALTER TABLE "public"."Server" DROP COLUMN IF EXISTS "agentLastSeenAt";
