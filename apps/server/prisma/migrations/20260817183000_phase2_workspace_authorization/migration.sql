-- Phase 2: contextual workspace/project authorization and mandatory tenant
-- ownership. This is a forward-only migration; historical migrations remain
-- immutable.

CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

ALTER TABLE "User" ADD COLUMN "pendingWorkspaceName" TEXT;

-- Workspace identity: display names may collide; slugs may not.
ALTER TABLE "Team" ADD COLUMN "slug" TEXT;
UPDATE "Team"
SET "slug" = COALESCE(
  NULLIF(trim(both '-' FROM regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g')), ''),
  'workspace'
) || '-' || substr(replace("id", '-', ''), 1, 8)
WHERE "slug" IS NULL;
ALTER TABLE "Team" ALTER COLUMN "slug" SET NOT NULL;
DROP INDEX "Team_name_key";
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");

ALTER TABLE "TeamMember"
  ADD COLUMN "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
  ADD COLUMN "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Preserve the old customer OWNER intent per workspace, then guarantee that
-- every existing workspace has at least one owner.
UPDATE "TeamMember" tm
SET "role" = 'OWNER'
FROM "User" u
WHERE u."id" = tm."userId" AND u."role"::text IN ('OWNER', 'SUPER_ADMIN');

WITH workspaces_without_owner AS (
  SELECT t."id"
  FROM "Team" t
  WHERE NOT EXISTS (
    SELECT 1 FROM "TeamMember" tm
    WHERE tm."teamId" = t."id" AND tm."role" = 'OWNER' AND tm."status" = 'ACTIVE'
  )
), first_members AS (
  SELECT DISTINCT ON (tm."teamId") tm."id"
  FROM "TeamMember" tm
  JOIN workspaces_without_owner w ON w."id" = tm."teamId"
  ORDER BY tm."teamId", tm."joinedAt", tm."id"
)
UPDATE "TeamMember" tm
SET "role" = 'OWNER', "status" = 'ACTIVE'
FROM first_members fm
WHERE tm."id" = fm."id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Team" t
    WHERE NOT EXISTS (
      SELECT 1
      FROM "TeamMember" tm
      WHERE tm."teamId" = t."id"
        AND tm."role" = 'OWNER'
        AND tm."status" = 'ACTIVE'
    )
  ) THEN
    RAISE EXCEPTION 'Phase 2 migration: every workspace must have at least one active owner';
  END IF;
END $$;

CREATE INDEX "TeamMember_userId_status_idx" ON "TeamMember"("userId", "status");
CREATE INDEX "TeamMember_teamId_role_status_idx" ON "TeamMember"("teamId", "role", "status");

-- Resolve legacy projects from their members when that mapping is unambiguous.
UPDATE "Project" p
SET "teamId" = candidates."teamId"
FROM (
  SELECT pm."projectId", min(tm."teamId") AS "teamId"
  FROM "ProjectMember" pm
  JOIN "TeamMember" tm ON tm."userId" = pm."userId"
  GROUP BY pm."projectId"
  HAVING count(DISTINCT tm."teamId") = 1
) candidates
WHERE p."id" = candidates."projectId" AND p."teamId" IS NULL;

UPDATE "Project"
SET "teamId" = (SELECT "id" FROM "Team" LIMIT 1)
WHERE "teamId" IS NULL AND (SELECT count(*) FROM "Team") = 1;

-- Resolve legacy servers through their environment/project when possible.
UPDATE "Server" s
SET "teamId" = p."teamId"
FROM "Environment" e
JOIN "Project" p ON p."id" = e."projectId"
WHERE s."environmentId" = e."id" AND s."teamId" IS NULL;

UPDATE "Server"
SET "teamId" = (SELECT "id" FROM "Team" LIMIT 1)
WHERE "teamId" IS NULL AND (SELECT count(*) FROM "Team") = 1;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Project" WHERE "teamId" IS NULL) THEN
    RAISE EXCEPTION 'Phase 2 migration: orphan projects require an explicit workspace mapping';
  END IF;
  IF EXISTS (SELECT 1 FROM "Server" WHERE "teamId" IS NULL) THEN
    RAISE EXCEPTION 'Phase 2 migration: orphan servers require an explicit workspace mapping';
  END IF;
END $$;

ALTER TABLE "Project" DROP CONSTRAINT "Project_teamId_fkey";
ALTER TABLE "Server" DROP CONSTRAINT "Server_teamId_fkey";
ALTER TABLE "Project" ALTER COLUMN "teamId" SET NOT NULL;
ALTER TABLE "Server" ALTER COLUMN "teamId" SET NOT NULL;

-- Project roles now describe technical responsibility, not workspace ownership.
BEGIN;
CREATE TYPE "ProjectRole_new" AS ENUM ('MAINTAINER', 'DEVELOPER', 'VIEWER');
ALTER TABLE "ProjectMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "ProjectMember"
  ALTER COLUMN "role" TYPE "ProjectRole_new"
  USING (
    CASE WHEN "role"::text = 'OWNER' THEN 'MAINTAINER' ELSE "role"::text END
  )::"ProjectRole_new";
ALTER TYPE "ProjectRole" RENAME TO "ProjectRole_old";
ALTER TYPE "ProjectRole_new" RENAME TO "ProjectRole";
DROP TYPE "ProjectRole_old";
ALTER TABLE "ProjectMember" ALTER COLUMN "role" SET DEFAULT 'DEVELOPER';
COMMIT;

ALTER TABLE "ProjectMember" ADD COLUMN "teamId" TEXT;
UPDATE "ProjectMember" pm
SET "teamId" = p."teamId"
FROM "Project" p
WHERE p."id" = pm."projectId";
ALTER TABLE "ProjectMember" ALTER COLUMN "teamId" SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ProjectMember" pm
    WHERE NOT EXISTS (
      SELECT 1
      FROM "TeamMember" tm
      WHERE tm."teamId" = pm."teamId"
        AND tm."userId" = pm."userId"
    )
  ) THEN
    RAISE EXCEPTION 'Phase 2 migration: every project member must belong to the project workspace';
  END IF;
END $$;

ALTER TABLE "ProjectMember" DROP CONSTRAINT "ProjectMember_projectId_fkey";
CREATE UNIQUE INDEX "Project_id_teamId_key" ON "Project"("id", "teamId");
CREATE INDEX "Project_teamId_createdAt_idx" ON "Project"("teamId", "createdAt");
CREATE INDEX "ProjectMember_teamId_projectId_idx" ON "ProjectMember"("teamId", "projectId");
CREATE INDEX "Server_teamId_archivedAt_idx" ON "Server"("teamId", "archivedAt");

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Server"
  ADD CONSTRAINT "Server_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMember"
  ADD CONSTRAINT "ProjectMember_projectId_teamId_fkey"
  FOREIGN KEY ("projectId", "teamId") REFERENCES "Project"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMember"
  ADD CONSTRAINT "ProjectMember_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMember"
  ADD CONSTRAINT "ProjectMember_teamId_userId_fkey"
  FOREIGN KEY ("teamId", "userId") REFERENCES "TeamMember"("teamId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkspaceInvitation" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "tokenHash" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkspaceInvitation_tokenHash_key" ON "WorkspaceInvitation"("tokenHash");
CREATE INDEX "WorkspaceInvitation_teamId_status_expiresAt_idx" ON "WorkspaceInvitation"("teamId", "status", "expiresAt");
CREATE INDEX "WorkspaceInvitation_email_status_idx" ON "WorkspaceInvitation"("email", "status");
ALTER TABLE "WorkspaceInvitation"
  ADD CONSTRAINT "WorkspaceInvitation_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvitation"
  ADD CONSTRAINT "WorkspaceInvitation_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD COLUMN "teamId" TEXT;
CREATE INDEX "AuditLog_teamId_createdAt_idx" ON "AuditLog"("teamId", "createdAt");
ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Workspace-owned credential resources. Existing values are resolved from
-- their relations first and from the sole workspace only when unambiguous.
ALTER TABLE "SshKey" ADD COLUMN "teamId" TEXT;
UPDATE "SshKey" k
SET "teamId" = candidates."teamId"
FROM (
  SELECT "userId", min("teamId") AS "teamId"
  FROM "TeamMember"
  WHERE "status" = 'ACTIVE'
  GROUP BY "userId"
  HAVING count(DISTINCT "teamId") = 1
) candidates
WHERE candidates."userId" = k."userId";

ALTER TABLE "GitProviderConfig" ADD COLUMN "teamId" TEXT;
UPDATE "GitProviderConfig" g
SET "teamId" = candidates."teamId"
FROM (
  SELECT s."providerId", min(p."teamId") AS "teamId"
  FROM "Service" s
  JOIN "Project" p ON p."id" = s."projectId"
  WHERE s."providerId" IS NOT NULL
  GROUP BY s."providerId"
  HAVING count(DISTINCT p."teamId") = 1
) candidates
WHERE candidates."providerId" = g."id";

ALTER TABLE "RegistryConfig" ADD COLUMN "teamId" TEXT;
UPDATE "RegistryConfig" r
SET "teamId" = g."teamId"
FROM "GitProviderConfig" g
WHERE r."providerId" = g."id" AND g."teamId" IS NOT NULL;

ALTER TABLE "DnsProvider" ADD COLUMN "teamId" TEXT;
UPDATE "DnsProvider" d
SET "teamId" = candidates."teamId"
FROM (
  SELECT dom."providerId", min(p."teamId") AS "teamId"
  FROM "Domain" dom
  JOIN "Project" p ON p."id" = dom."projectId"
  WHERE dom."providerId" IS NOT NULL
  GROUP BY dom."providerId"
  HAVING count(DISTINCT p."teamId") = 1
) candidates
WHERE candidates."providerId" = d."id";

UPDATE "SshKey" SET "teamId" = (SELECT "id" FROM "Team" LIMIT 1)
WHERE "teamId" IS NULL AND (SELECT count(*) FROM "Team") = 1;
UPDATE "GitProviderConfig" SET "teamId" = (SELECT "id" FROM "Team" LIMIT 1)
WHERE "teamId" IS NULL AND (SELECT count(*) FROM "Team") = 1;
UPDATE "RegistryConfig" SET "teamId" = (SELECT "id" FROM "Team" LIMIT 1)
WHERE "teamId" IS NULL AND (SELECT count(*) FROM "Team") = 1;
UPDATE "DnsProvider" SET "teamId" = (SELECT "id" FROM "Team" LIMIT 1)
WHERE "teamId" IS NULL AND (SELECT count(*) FROM "Team") = 1;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "SshKey" WHERE "teamId" IS NULL) THEN
    RAISE EXCEPTION 'Phase 2 migration: SSH keys require an explicit workspace mapping';
  END IF;
  IF EXISTS (SELECT 1 FROM "GitProviderConfig" WHERE "teamId" IS NULL) THEN
    RAISE EXCEPTION 'Phase 2 migration: Git providers require an explicit workspace mapping';
  END IF;
  IF EXISTS (SELECT 1 FROM "RegistryConfig" WHERE "teamId" IS NULL) THEN
    RAISE EXCEPTION 'Phase 2 migration: registries require an explicit workspace mapping';
  END IF;
  IF EXISTS (SELECT 1 FROM "DnsProvider" WHERE "teamId" IS NULL) THEN
    RAISE EXCEPTION 'Phase 2 migration: DNS providers require an explicit workspace mapping';
  END IF;
END $$;

ALTER TABLE "SshKey" ALTER COLUMN "teamId" SET NOT NULL;
ALTER TABLE "GitProviderConfig" ALTER COLUMN "teamId" SET NOT NULL;
ALTER TABLE "RegistryConfig" ALTER COLUMN "teamId" SET NOT NULL;
ALTER TABLE "DnsProvider" ALTER COLUMN "teamId" SET NOT NULL;

DROP INDEX "GitProviderConfig_type_isDefault_idx";
DROP INDEX "GitProviderConfig_type_name_key";
DROP INDEX "RegistryConfig_type_isDefault_idx";
DROP INDEX "RegistryConfig_type_name_key";
DROP INDEX "DnsProvider_type_name_key";

CREATE INDEX "SshKey_teamId_createdAt_idx" ON "SshKey"("teamId", "createdAt");
CREATE INDEX "GitProviderConfig_teamId_type_isDefault_idx" ON "GitProviderConfig"("teamId", "type", "isDefault");
CREATE UNIQUE INDEX "GitProviderConfig_teamId_type_name_key" ON "GitProviderConfig"("teamId", "type", "name");
CREATE INDEX "RegistryConfig_teamId_type_isDefault_idx" ON "RegistryConfig"("teamId", "type", "isDefault");
CREATE UNIQUE INDEX "RegistryConfig_teamId_type_name_key" ON "RegistryConfig"("teamId", "type", "name");
CREATE INDEX "DnsProvider_teamId_type_idx" ON "DnsProvider"("teamId", "type");
CREATE UNIQUE INDEX "DnsProvider_teamId_type_name_key" ON "DnsProvider"("teamId", "type", "name");

ALTER TABLE "SshKey"
  ADD CONSTRAINT "SshKey_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GitProviderConfig"
  ADD CONSTRAINT "GitProviderConfig_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistryConfig"
  ADD CONSTRAINT "RegistryConfig_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DnsProvider"
  ADD CONSTRAINT "DnsProvider_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
