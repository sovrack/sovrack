-- A consumed one-time grant becomes a short support session. Persisting its
-- lifecycle makes explicit logout enforceable server-side before JWT expiry.
ALTER TABLE "StaffImpersonationGrant"
  ADD COLUMN "sessionExpiresAt" TIMESTAMP(3),
  ADD COLUMN "endedAt" TIMESTAMP(3);

CREATE INDEX "StaffImpersonationGrant_sessionExpiresAt_endedAt_idx"
  ON "StaffImpersonationGrant"("sessionExpiresAt", "endedAt");
