-- Replace long-lived staff invitation links with short-lived email codes.
-- Existing invitations are intentionally invalidated: an administrator or the
-- invited staff member must request a fresh code after this release.
ALTER TABLE "StaffInvitation"
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "requestedIp" TEXT,
ADD COLUMN "deliveredAt" TIMESTAMP(3);

UPDATE "StaffInvitation"
SET "usedAt" = CURRENT_TIMESTAMP
WHERE "usedAt" IS NULL;
