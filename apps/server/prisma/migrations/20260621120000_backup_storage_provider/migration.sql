-- Pluggable backup storage: record where each dump lives (LOCAL host fs or S3).
-- Existing rows are LOCAL (the only mode that existed) → safe default.
CREATE TYPE "BackupStorageProvider" AS ENUM ('LOCAL', 'S3');
ALTER TABLE "DatabaseBackup"
  ADD COLUMN "storageProvider" "BackupStorageProvider" NOT NULL DEFAULT 'LOCAL';
