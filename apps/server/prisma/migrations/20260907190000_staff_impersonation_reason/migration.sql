-- Every support impersonation must carry an explicit operational reason.
-- This is immutable evidence attached to the one-time grant and audit trail.
ALTER TABLE "StaffImpersonationGrant"
  ADD COLUMN "reason" TEXT;

UPDATE "StaffImpersonationGrant"
  SET "reason" = 'Session créée avant la traçabilité du motif'
  WHERE "reason" IS NULL;

ALTER TABLE "StaffImpersonationGrant"
  ALTER COLUMN "reason" SET NOT NULL;
