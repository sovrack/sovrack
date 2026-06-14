/*
  Warnings:

  - You are about to drop the `ServerAuditEvent` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";

-- DropForeignKey
ALTER TABLE "ServerAuditEvent" DROP CONSTRAINT "ServerAuditEvent_actorId_fkey";

-- DropForeignKey
ALTER TABLE "ServerAuditEvent" DROP CONSTRAINT "ServerAuditEvent_serverId_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "userId" DROP NOT NULL;

-- DropTable
DROP TABLE "ServerAuditEvent";

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
