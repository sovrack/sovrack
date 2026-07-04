-- Fix: the 2026-07-01 migration "remove_database_backups" targeted the wrong
-- table-name casing ("database_backups" instead of the real "DatabaseBackup")
-- and failed on its very first statement (ALTER TABLE requires the table to
-- exist, unlike DROP TABLE IF EXISTS) — leaving _prisma_migrations stuck and
-- the table never actually dropped. This finishes that cleanup for real,
-- against the actual table name.

-- DropForeignKey
ALTER TABLE "DatabaseBackup" DROP CONSTRAINT IF EXISTS "DatabaseBackup_serviceEnvironmentId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "DatabaseBackup_serviceEnvironmentId_createdAt_idx";
DROP INDEX IF EXISTS "DatabaseBackup_status_idx";

-- DropTable
DROP TABLE IF EXISTS "DatabaseBackup";

-- DropEnum
DROP TYPE IF EXISTS "BackupStatus";
DROP TYPE IF EXISTS "BackupTrigger";
DROP TYPE IF EXISTS "BackupStorageProvider";
