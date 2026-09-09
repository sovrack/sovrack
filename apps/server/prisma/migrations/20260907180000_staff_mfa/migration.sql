-- Complete staff TOTP MFA: encrypted authenticator secret, replay protection
-- and hashed one-time recovery codes.
ALTER TABLE "Staff"
  ADD COLUMN "mfaLastUsedStep" BIGINT;

CREATE TABLE "StaffMfaRecoveryCode" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffMfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffMfaRecoveryCode_codeHash_key"
  ON "StaffMfaRecoveryCode"("codeHash");
CREATE INDEX "StaffMfaRecoveryCode_staffId_usedAt_idx"
  ON "StaffMfaRecoveryCode"("staffId", "usedAt");

ALTER TABLE "StaffMfaRecoveryCode"
  ADD CONSTRAINT "StaffMfaRecoveryCode_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "Staff"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
