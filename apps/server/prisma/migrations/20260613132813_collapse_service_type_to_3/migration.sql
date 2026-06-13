-- Collapse ServiceType 8 -> 3 (APPLICATION / DATABASE / MANAGED).
-- Modele Railway : le TYPE = nature du service. L'axe "d'ou vient l'artefact"
-- reste porte par sourceType (GIT/DOCKER_IMAGE/NONE) + buildPack/buildType :
-- on ne duplique donc PAS un enum ArtifactSource.
--
-- Mapping :
--   WEB_SERVICE / WORKER / CRON_JOB / COMPOSE -> APPLICATION
--   CACHE / QUEUE                              -> DATABASE
--   (APPLICATION / DATABASE inchanges ; MANAGED nouveau)

-- 1) Backfill AVANT le cast : la colonne est encore de l'ancien type, donc
--    'APPLICATION'/'DATABASE' y sont des valeurs valides. Indispensable, sinon
--    le cast ::ServiceType_new echoue sur toute ligne portant une valeur retiree.
UPDATE "Service" SET "type" = 'APPLICATION'
  WHERE "type" IN ('WEB_SERVICE', 'WORKER', 'CRON_JOB', 'COMPOSE');
UPDATE "Service" SET "type" = 'DATABASE'
  WHERE "type" IN ('CACHE', 'QUEUE');

-- 2) Recreation du type enum (bloc genere par Prisma migrate diff).
-- AlterEnum
BEGIN;
CREATE TYPE "ServiceType_new" AS ENUM ('APPLICATION', 'DATABASE', 'MANAGED');
ALTER TABLE "public"."Service" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Service" ALTER COLUMN "type" TYPE "ServiceType_new" USING ("type"::text::"ServiceType_new");
ALTER TYPE "ServiceType" RENAME TO "ServiceType_old";
ALTER TYPE "ServiceType_new" RENAME TO "ServiceType";
DROP TYPE "public"."ServiceType_old";
ALTER TABLE "Service" ALTER COLUMN "type" SET DEFAULT 'APPLICATION';
COMMIT;
