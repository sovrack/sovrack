-- Enforce one active ServerPreparation per server at DB level.
-- Application locks remain in place; this index provides hard safety.

CREATE UNIQUE INDEX IF NOT EXISTS "ServerPreparation_one_active_per_server_idx"
ON "public"."ServerPreparation" ("serverId")
WHERE "status" IN (
  'QUEUED'::"public"."ServerPreparationStatus",
  'RESOLVING_OPTIONS'::"public"."ServerPreparationStatus",
  'WAITING_FOR_LOCK'::"public"."ServerPreparationStatus",
  'RUNNING'::"public"."ServerPreparationStatus"
);
