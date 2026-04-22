-- CreateEnum
CREATE TYPE "public"."ServerStatus" AS ENUM ('NEW', 'VERIFYING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."ServerLogLevel" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- AlterTable
ALTER TABLE "public"."Server" ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "status" "public"."ServerStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "verificationError" TEXT;

-- CreateTable
CREATE TABLE "public"."ServerLog" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "level" "public"."ServerLogLevel" NOT NULL DEFAULT 'INFO',
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerLog_serverId_createdAt_idx" ON "public"."ServerLog"("serverId", "createdAt");

-- CreateIndex
CREATE INDEX "ServerLog_level_idx" ON "public"."ServerLog"("level");

-- AddForeignKey
ALTER TABLE "public"."ServerLog" ADD CONSTRAINT "ServerLog_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "public"."Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
