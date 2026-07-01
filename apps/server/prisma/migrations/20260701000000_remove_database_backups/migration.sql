-- DropForeignKey
ALTER TABLE "database_backups" DROP CONSTRAINT IF EXISTS "database_backups_serviceEnvironmentId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "database_backups_serviceEnvironmentId_createdAt_idx";
DROP INDEX IF EXISTS "database_backups_status_idx";

-- DropTable
DROP TABLE IF EXISTS "database_backups";

-- DropEnum
DROP TYPE IF EXISTS "BackupStatus";
DROP TYPE IF EXISTS "BackupTrigger";
DROP TYPE IF EXISTS "BackupStorageProvider";
