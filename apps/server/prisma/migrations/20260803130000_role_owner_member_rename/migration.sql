-- Renommage des rôles plateforme :
--   ADMIN    -> OWNER   (propriétaire d'une organisation)
--   DEVELOPER-> MEMBER  (membre d'une organisation)
-- SUPER_ADMIN est inchangé (propriétaire de la plateforme / back-office).
-- L'enum ProjectRole (OWNER / DEVELOPER / VIEWER) n'est PAS touché.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OWNER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MEMBER';

UPDATE "User" SET "role" = 'OWNER' WHERE "role" = 'ADMIN';
UPDATE "User" SET "role" = 'MEMBER' WHERE "role" = 'DEVELOPER';

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

ALTER TYPE "Role" DROP VALUE IF EXISTS 'ADMIN';
ALTER TYPE "Role" DROP VALUE IF EXISTS 'DEVELOPER';
