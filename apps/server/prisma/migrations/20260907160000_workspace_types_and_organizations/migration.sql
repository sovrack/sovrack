-- Workspace identity is distinct from commercial plan: an account owns one
-- PERSONAL workspace or collaborates through one or more ORGANIZATION spaces.
CREATE TYPE "WorkspaceType" AS ENUM ('PERSONAL', 'ORGANIZATION');
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED', 'DELETION_PENDING');

ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'BILLING';

ALTER TABLE "User"
  ADD COLUMN "pendingWorkspaceType" "WorkspaceType";

ALTER TABLE "Team"
  ADD COLUMN "type" "WorkspaceType" NOT NULL DEFAULT 'ORGANIZATION',
  ADD COLUMN "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "personalOwnerId" TEXT;

CREATE UNIQUE INDEX "Team_personalOwnerId_key" ON "Team"("personalOwnerId");
CREATE INDEX "Team_type_status_idx" ON "Team"("type", "status");

ALTER TABLE "Team"
  ADD CONSTRAINT "Team_personalOwnerId_fkey"
  FOREIGN KEY ("personalOwnerId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Team"
  ADD CONSTRAINT "Team_type_owner_consistency"
  CHECK (
    ("type" = 'PERSONAL' AND "personalOwnerId" IS NOT NULL)
    OR ("type" = 'ORGANIZATION' AND "personalOwnerId" IS NULL)
  );

CREATE TABLE "OrganizationProfile" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "legalName" TEXT,
  "billingEmail" TEXT,
  "registrationNumber" TEXT,
  "taxId" TEXT,
  "addressLine1" TEXT,
  "addressLine2" TEXT,
  "city" TEXT,
  "postalCode" TEXT,
  "countryCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationProfile_teamId_key"
  ON "OrganizationProfile"("teamId");

ALTER TABLE "OrganizationProfile"
  ADD CONSTRAINT "OrganizationProfile_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
