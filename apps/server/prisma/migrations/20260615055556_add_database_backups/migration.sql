-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "BackupTrigger" AS ENUM ('MANUAL', 'SCHEDULED');

-- CreateTable
CREATE TABLE "DatabaseBackup" (
    "id" TEXT NOT NULL,
    "serviceEnvironmentId" TEXT NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'PENDING',
    "trigger" "BackupTrigger" NOT NULL DEFAULT 'MANUAL',
    "storagePath" TEXT,
    "sizeBytes" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatabaseBackup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DatabaseBackup_serviceEnvironmentId_createdAt_idx" ON "DatabaseBackup"("serviceEnvironmentId", "createdAt");

-- CreateIndex
CREATE INDEX "DatabaseBackup_status_idx" ON "DatabaseBackup"("status");

-- AddForeignKey
ALTER TABLE "DatabaseBackup" ADD CONSTRAINT "DatabaseBackup_serviceEnvironmentId_fkey" FOREIGN KEY ("serviceEnvironmentId") REFERENCES "ServiceEnvironment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
