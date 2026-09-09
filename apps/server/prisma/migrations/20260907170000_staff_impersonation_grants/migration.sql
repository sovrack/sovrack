-- Cross-domain staff impersonation uses a short-lived one-time grant. A client
-- JWT is only issued when the grant is exchanged on the customer app host.
CREATE TABLE "StaffImpersonationGrant" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "requestedIp" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffImpersonationGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffImpersonationGrant_tokenHash_key"
  ON "StaffImpersonationGrant"("tokenHash");
CREATE INDEX "StaffImpersonationGrant_expiresAt_idx"
  ON "StaffImpersonationGrant"("expiresAt");
CREATE INDEX "StaffImpersonationGrant_staffId_createdAt_idx"
  ON "StaffImpersonationGrant"("staffId", "createdAt");
CREATE INDEX "StaffImpersonationGrant_userId_createdAt_idx"
  ON "StaffImpersonationGrant"("userId", "createdAt");

ALTER TABLE "StaffImpersonationGrant"
  ADD CONSTRAINT "StaffImpersonationGrant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffImpersonationGrant"
  ADD CONSTRAINT "StaffImpersonationGrant_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "Staff"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
