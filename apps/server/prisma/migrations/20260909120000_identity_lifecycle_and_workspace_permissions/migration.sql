BEGIN;

CREATE TYPE "InvitationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

ALTER TABLE "User"
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletionScheduledFor" TIMESTAMP(3);

CREATE INDEX "User_deletionScheduledFor_idx"
  ON "User"("deletionScheduledFor");

ALTER TABLE "TeamMember"
  ADD COLUMN "canManageBilling" BOOLEAN NOT NULL DEFAULT false;

-- BILLING used to be an exclusive workspace role. Preserve its intent while
-- restoring normal workspace visibility through MEMBER permissions.
UPDATE "TeamMember"
SET "role" = 'MEMBER', "canManageBilling" = true
WHERE "role" = 'BILLING';

-- Old pending invitations cannot carry an orthogonal permission. Keep the
-- collaboration intent as MEMBER; billing can be delegated after acceptance.
UPDATE "WorkspaceInvitation"
SET "role" = 'MEMBER'
WHERE "role" = 'BILLING';

-- PostgreSQL cannot remove one enum value in place. Rebuild the enum only
-- after every legacy BILLING row has been converted.
ALTER TABLE "TeamMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "WorkspaceInvitation" ALTER COLUMN "role" DROP DEFAULT;
ALTER TYPE "WorkspaceRole" RENAME TO "WorkspaceRole_legacy";
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
ALTER TABLE "TeamMember"
  ALTER COLUMN "role" TYPE "WorkspaceRole"
  USING ("role"::text::"WorkspaceRole");
ALTER TABLE "WorkspaceInvitation"
  ALTER COLUMN "role" TYPE "WorkspaceRole"
  USING ("role"::text::"WorkspaceRole");
ALTER TABLE "TeamMember" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
ALTER TABLE "WorkspaceInvitation" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
DROP TYPE "WorkspaceRole_legacy";

ALTER TABLE "WorkspaceInvitation"
  ADD COLUMN "deliveryStatus" "InvitationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "lastDeliveryAttemptAt" TIMESTAMP(3),
  ADD COLUMN "lastDeliveryError" TEXT,
  ADD COLUMN "invitedByEmail" TEXT,
  ADD COLUMN "invitedByName" TEXT;

UPDATE "WorkspaceInvitation" invitation
SET
  "invitedByEmail" = inviter."email",
  "invitedByName" = inviter."fullName",
  "deliveryStatus" = 'SENT',
  "deliveryAttempts" = 1,
  "deliveredAt" = invitation."createdAt",
  "lastDeliveryAttemptAt" = invitation."createdAt"
FROM "User" inviter
WHERE invitation."invitedById" = inviter."id";

UPDATE "WorkspaceInvitation"
SET
  "invitedByEmail" = COALESCE("invitedByEmail", 'unknown@invalid.local'),
  "invitedByName" = COALESCE("invitedByName", 'Compte supprimé');

ALTER TABLE "WorkspaceInvitation"
  ALTER COLUMN "invitedByEmail" SET NOT NULL,
  ALTER COLUMN "invitedByName" SET NOT NULL,
  ALTER COLUMN "invitedById" DROP NOT NULL;

ALTER TABLE "WorkspaceInvitation"
  DROP CONSTRAINT "WorkspaceInvitation_invitedById_fkey";

ALTER TABLE "WorkspaceInvitation"
  ADD CONSTRAINT "WorkspaceInvitation_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "WorkspaceInvitation_deliveryStatus_lastDeliveryAttemptAt_idx"
  ON "WorkspaceInvitation"("deliveryStatus", "lastDeliveryAttemptAt");

-- GitHub OAuth was never completed. Retire misleading legacy values and keep
-- the first-beta provider contract PAT-only. Existing PATs remain untouched.
UPDATE "GitProviderConfig"
SET
  "redirectUri" = NULL,
  "applicationId" = NULL,
  "applicationSecret" = NULL,
  "oauthAccessToken" = NULL,
  "oauthRefreshToken" = NULL,
  "oauthExpiresAt" = NULL,
  "groupNames" = NULL
WHERE "type" = 'GITHUB';

COMMIT;
