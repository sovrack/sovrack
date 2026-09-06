-- Customer password reset abuse protection and immediate JWT revocation.
ALTER TABLE "User"
  ADD COLUMN "passwordResetRequestedAt" TIMESTAMP(3),
  ADD COLUMN "passwordResetAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
