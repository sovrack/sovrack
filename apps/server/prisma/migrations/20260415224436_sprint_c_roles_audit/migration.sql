-- CreateEnum
CREATE TYPE "public"."ProjectRole" AS ENUM ('OWNER', 'DEVELOPER', 'VIEWER');

-- AlterTable
ALTER TABLE "public"."ProjectMember"
ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "public"."ProjectMember"
ALTER COLUMN "role" TYPE "public"."ProjectRole"
USING (
  CASE
    WHEN "role"::text = 'MEMBER' THEN 'DEVELOPER'
    ELSE "role"::text
  END
)::"public"."ProjectRole";

ALTER TABLE "public"."ProjectMember"
ALTER COLUMN "role" SET DEFAULT 'DEVELOPER';

-- DropEnum
DROP TYPE "public"."ProjectMemberRole";

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "public"."AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "public"."AuditLog"("resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
