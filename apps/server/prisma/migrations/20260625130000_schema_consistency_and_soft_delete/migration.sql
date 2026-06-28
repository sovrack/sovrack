-- B1 + C1 + A2: schema consistency (updatedAt), redundant index removal,
-- and Service soft-delete partial-unique index.

-- C1: drop redundant index (covered by the [serviceEnvId, status, createdAt] composite).
DROP INDEX "Deployment_serviceEnvId_idx";

-- A2: replace the full unique on Service(projectId, name) with a PARTIAL unique
-- index scoped to ACTIVE rows, so an ARCHIVED service no longer blocks reusing
-- its name. (Prisma can't express partial indexes → managed here in raw SQL.)
DROP INDEX "Service_projectId_name_key";
CREATE UNIQUE INDEX "Service_projectId_name_active_key"
  ON "Service" ("projectId", "name")
  WHERE "archivedAt" IS NULL;

-- B1: ProjectMember.updatedAt — DB default CURRENT_TIMESTAMP (matches the
-- @default(now()) @updatedAt model; required so `db push` can add it to a
-- non-empty table in the e2e harness).
ALTER TABLE "ProjectMember" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- B1: ServiceEnvironment.createdAt + updatedAt (both default now()).
ALTER TABLE "ServiceEnvironment" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ServiceEnvironment" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
