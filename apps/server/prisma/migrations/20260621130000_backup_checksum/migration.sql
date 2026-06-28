-- Add a SHA-256 integrity checksum to backups (detect silent corruption).
ALTER TABLE "DatabaseBackup" ADD COLUMN "checksum" TEXT;
