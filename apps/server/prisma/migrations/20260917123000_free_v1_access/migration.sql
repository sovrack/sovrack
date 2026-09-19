BEGIN;

ALTER TABLE "Subscription"
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

UPDATE "Subscription"
SET
  "status" = 'ACTIVE',
  "trialEndsAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "plan" = 'FREE'
  AND "status" = 'TRIALING';

COMMIT;
