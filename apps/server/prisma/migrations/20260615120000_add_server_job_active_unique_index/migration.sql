-- Phase 1 (PLAN_AMELIORATION.md) — fix ServerJob race condition / "BLOCKED ghost jobs".
--
-- Root cause: assertNoActiveJob() + createJob() were two separate, non-atomic
-- statements. Two concurrent operations on the same server both passed the
-- in-memory check and created two jobs; the second was marked BLOCKED forever
-- (a terminal state nothing recovers from). This partial unique index makes
-- "at most one active job per server" a hard database invariant, so the second
-- concurrent INSERT now fails with P2002 (surfaced as a clean 409) instead.

-- 1) Clean up any pre-existing duplicate active jobs so the unique index can be
--    created. Keep the most recent active job per server; mark older ones FAILED
--    (these are the historical race ghosts).
UPDATE "ServerJob" sj
SET "status"     = 'FAILED',
    "error"      = 'Doublon nettoyé lors de la migration (un seul job actif par serveur).',
    "finishedAt" = now()
WHERE sj."status" IN ('RUNNING', 'PENDING')
  AND sj."id" <> (
    SELECT s2."id"
    FROM "ServerJob" s2
    WHERE s2."serverId" = sj."serverId"
      AND s2."status" IN ('RUNNING', 'PENDING')
    ORDER BY s2."createdAt" DESC, s2."id" DESC
    LIMIT 1
  );

-- 2) At most one RUNNING/PENDING job per server. BLOCKED/SUCCESS/FAILED/TIMEOUT
--    are terminal and intentionally excluded from the constraint.
CREATE UNIQUE INDEX "unique_active_server_job"
  ON "ServerJob" ("serverId")
  WHERE "status" IN ('RUNNING', 'PENDING');
