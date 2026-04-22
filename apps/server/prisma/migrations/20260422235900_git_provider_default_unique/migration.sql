-- Keep only one default provider per type before adding the unique partial index.
WITH ranked_defaults AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "type"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "public"."GitProviderConfig"
  WHERE "isDefault" = true
)
UPDATE "public"."GitProviderConfig" AS config
SET "isDefault" = false
FROM ranked_defaults
WHERE config."id" = ranked_defaults."id"
  AND ranked_defaults.rn > 1;

-- Enforce one default provider per provider type (currently GitLab).
CREATE UNIQUE INDEX "GitProviderConfig_one_default_per_type_idx"
ON "public"."GitProviderConfig"("type")
WHERE "isDefault" = true;
