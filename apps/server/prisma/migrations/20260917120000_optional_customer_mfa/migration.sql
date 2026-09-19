BEGIN;

ALTER TABLE "User"
  ADD COLUMN "mfaSecret" TEXT,
  ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaLastUsedStep" BIGINT;

CREATE TABLE "UserMfaRecoveryCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserMfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserMfaRecoveryCode_codeHash_key"
  ON "UserMfaRecoveryCode"("codeHash");
CREATE INDEX "UserMfaRecoveryCode_userId_usedAt_idx"
  ON "UserMfaRecoveryCode"("userId", "usedAt");

ALTER TABLE "UserMfaRecoveryCode"
  ADD CONSTRAINT "UserMfaRecoveryCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
