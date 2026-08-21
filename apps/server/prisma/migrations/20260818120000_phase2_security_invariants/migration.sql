-- Bind verification codes to the browser registration attempt that created
-- them. Active legacy email accounts are marked verified before the runtime
-- starts enforcing that invariant.
ALTER TABLE "User"
  ADD COLUMN "emailVerificationAttemptId" TEXT;

UPDATE "User"
SET "emailVerifiedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE "isActive" = TRUE
  AND "provider" = 'email'
  AND "emailVerifiedAt" IS NULL;

-- Keep the oldest delivery record and remove duplicate audit rows before the
-- database becomes the final idempotency arbiter under concurrent retries.
DELETE FROM "WebhookEvent" duplicate
USING "WebhookEvent" canonical
WHERE duplicate."endpointId" = canonical."endpointId"
  AND duplicate."externalDeliveryId" = canonical."externalDeliveryId"
  AND duplicate."externalDeliveryId" IS NOT NULL
  AND (
    duplicate."receivedAt" > canonical."receivedAt"
    OR (
      duplicate."receivedAt" = canonical."receivedAt"
      AND duplicate."id" > canonical."id"
    )
  );

DROP INDEX IF EXISTS "WebhookEvent_externalDeliveryId_idx";
CREATE UNIQUE INDEX "WebhookEvent_endpointId_externalDeliveryId_key"
  ON "WebhookEvent"("endpointId", "externalDeliveryId");

-- Provider pipeline ids are repository/project scoped. The old global key
-- could collide across tenants and correlate the wrong deployment.
DROP INDEX IF EXISTS "PipelineRun_externalId_provider_key";
CREATE UNIQUE INDEX "PipelineRun_projectId_externalId_provider_key"
  ON "PipelineRun"("projectId", "externalId", "provider");
