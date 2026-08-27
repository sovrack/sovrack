-- Password recovery for the isolated staff authentication plane. Codes are
-- stored as keyed hashes, are single-use and have a bounded attempt counter.
CREATE TABLE "StaffPasswordReset" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "requestedIp" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffPasswordReset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffPasswordReset_staffId_createdAt_idx"
ON "StaffPasswordReset"("staffId", "createdAt");
CREATE INDEX "StaffPasswordReset_expiresAt_idx"
ON "StaffPasswordReset"("expiresAt");

ALTER TABLE "StaffPasswordReset"
ADD CONSTRAINT "StaffPasswordReset_staffId_fkey"
FOREIGN KEY ("staffId") REFERENCES "Staff"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
