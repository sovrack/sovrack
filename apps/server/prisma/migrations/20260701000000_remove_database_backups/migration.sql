-- Remove the database-backups feature (model + enums).
-- FIX 2026-07-03: the original version targeted "database_backups" while the
-- creation migration (20260615055556) actually created "DatabaseBackup" — on a
-- FRESH database the un-guarded ALTER TABLE failed ("relation does not exist")
-- and every new install crash-looped on `prisma migrate deploy`. Rewritten to
-- be idempotent for both name variants (ALTER TABLE IF EXISTS + DROP IF EXISTS)
-- so it applies cleanly on fresh replays and on databases already cleaned up.

-- DropForeignKey
ALTER TABLE IF EXISTS "DatabaseBackup" DROP CONSTRAINT IF EXISTS "DatabaseBackup_serviceEnvironmentId_fkey";
ALTER TABLE IF EXISTS "database_backups" DROP CONSTRAINT IF EXISTS "database_backups_serviceEnvironmentId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "DatabaseBackup_serviceEnvironmentId_createdAt_idx";
DROP INDEX IF EXISTS "DatabaseBackup_status_idx";
DROP INDEX IF EXISTS "database_backups_serviceEnvironmentId_createdAt_idx";
DROP INDEX IF EXISTS "database_backups_status_idx";

-- DropTable
DROP TABLE IF EXISTS "DatabaseBackup";
DROP TABLE IF EXISTS "database_backups";

-- DropEnum
DROP TYPE IF EXISTS "BackupStatus";
DROP TYPE IF EXISTS "BackupTrigger";
DROP TYPE IF EXISTS "BackupStorageProvider";
