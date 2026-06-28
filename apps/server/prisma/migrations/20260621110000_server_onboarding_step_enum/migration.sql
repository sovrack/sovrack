-- Convert Server.onboardingStep from free String to the ServerOnboardingStep enum.
-- Data-preserving ALTER ... USING (Prisma's auto-diff would DROP+ADD = data loss).
-- All existing values already match enum labels (PENDING / KEY_INSTALLED).
CREATE TYPE "ServerOnboardingStep" AS ENUM (
  'PENDING', 'KEY_INSTALLED', 'SSH_VALIDATED', 'INFO_DETECTED',
  'PREPARATION_PENDING', 'PREPARING', 'READY', 'PREPARATION_FAILED'
);

ALTER TABLE "Server" ALTER COLUMN "onboardingStep" DROP DEFAULT;
ALTER TABLE "Server" ALTER COLUMN "onboardingStep" TYPE "ServerOnboardingStep"
  USING ("onboardingStep"::"ServerOnboardingStep");
ALTER TABLE "Server" ALTER COLUMN "onboardingStep" SET DEFAULT 'PENDING';
