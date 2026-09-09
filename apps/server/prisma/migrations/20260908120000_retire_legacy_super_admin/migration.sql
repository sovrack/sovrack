-- Retire the pre-Staff platform administrator identity without deleting rows
-- referenced by historical deployments or audit records. Authentication is
-- revoked before the legacy enum value is removed.
BEGIN;

ALTER TABLE "User"
ADD COLUMN "legacyStaffRetiredAt" TIMESTAMP(3);

UPDATE "User"
SET
  "isActive" = false,
  "password" = NULL,
  "googleId" = NULL,
  "sessionVersion" = "sessionVersion" + 1,
  "legacyStaffRetiredAt" = CURRENT_TIMESTAMP,
  "role" = 'MEMBER'
WHERE "role"::text = 'SUPER_ADMIN';

CREATE TYPE "Role_new" AS ENUM ('OWNER', 'MEMBER');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "Role_new"
  USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

CREATE INDEX "User_legacyStaffRetiredAt_idx"
ON "User"("legacyStaffRetiredAt");

COMMIT;
