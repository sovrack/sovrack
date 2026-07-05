-- Fix: the 2026-07-01 migration "remove_database_backups" targeted the wrong
-- table-name casing ("database_backups" instead of the real "DatabaseBackup")
-- and failed on its very first statement — leaving _prisma_migrations stuck and
-- the table never actually dropped. This finished that cleanup on the affected
-- (already-created) databases.
--
-- FRESH-INSTALL FIX (2026-07-05): on a brand-new database the sibling migration
-- 20260701000000 (rewritten idempotent) already drops "DatabaseBackup", so by
-- the time we get here the table is GONE. The bare `ALTER TABLE "DatabaseBackup"`
-- then failed with 42P01 ("relation does not exist"), breaking every fresh
-- `prisma migrate deploy` (CI test jobs, new server deploys). Guarded with
-- `ALTER TABLE IF EXISTS` so this migration is a safe no-op when the table is
-- already dropped, and still finishes the cleanup where the table survived.

-- DropForeignKey
ALTER TABLE IF EXISTS "DatabaseBackup" DROP CONSTRAINT IF EXISTS "DatabaseBackup_serviceEnvironmentId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "DatabaseBackup_serviceEnvironmentId_createdAt_idx";
DROP INDEX IF EXISTS "DatabaseBackup_status_idx";

-- DropTable
DROP TABLE IF EXISTS "DatabaseBackup";

-- DropEnum
DROP TYPE IF EXISTS "BackupStatus";
DROP TYPE IF EXISTS "BackupTrigger";
DROP TYPE IF EXISTS "BackupStorageProvider";
