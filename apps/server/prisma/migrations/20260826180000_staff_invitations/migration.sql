-- Invite staff without sharing administrator-chosen passwords. Invitation
-- tokens are stored only as SHA-256 hashes and expire after 24 hours.
ALTER TYPE "StaffStatus" ADD VALUE IF NOT EXISTS 'INVITED' BEFORE 'ACTIVE';

CREATE TABLE "StaffInvitation" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffInvitation_staffId_key" ON "StaffInvitation"("staffId");
CREATE UNIQUE INDEX "StaffInvitation_tokenHash_key" ON "StaffInvitation"("tokenHash");
CREATE INDEX "StaffInvitation_expiresAt_idx" ON "StaffInvitation"("expiresAt");

ALTER TABLE "StaffInvitation"
ADD CONSTRAINT "StaffInvitation_staffId_fkey"
FOREIGN KEY ("staffId") REFERENCES "Staff"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
