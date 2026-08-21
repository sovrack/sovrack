-- ServerRun is a tenant resource. Backfill from its direct server for
-- PREPARATION runs and from all target servers for AUTOMATION runs. Abort if a
-- historical automation ever mixed workspaces: assigning it arbitrarily would
-- hide a real isolation defect.
ALTER TABLE "ServerRun" ADD COLUMN "teamId" TEXT;

UPDATE "ServerRun" AS run
SET "teamId" = server."teamId"
FROM "Server" AS server
WHERE run."serverId" = server."id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ServerRun" run
    LEFT JOIN "ServerRunStep" step ON step."runId" = run."id"
    LEFT JOIN "Server" server ON server."id" = step."serverId"
    WHERE run."teamId" IS NULL
    GROUP BY run."id"
    HAVING COUNT(DISTINCT server."teamId") <> 1
  ) THEN
    RAISE EXCEPTION 'Cannot assign workspace to ServerRun: missing or mixed-workspace targets';
  END IF;
END $$;

UPDATE "ServerRun" AS run
SET "teamId" = candidates."teamId"
FROM (
  SELECT step."runId", MIN(server."teamId") AS "teamId"
  FROM "ServerRunStep" step
  JOIN "Server" server ON server."id" = step."serverId"
  GROUP BY step."runId"
) AS candidates
WHERE run."id" = candidates."runId"
  AND run."teamId" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ServerRun" run
    JOIN "ServerRunStep" step ON step."runId" = run."id"
    JOIN "Server" server ON server."id" = step."serverId"
    GROUP BY run."id", run."teamId"
    HAVING COUNT(DISTINCT server."teamId") > 1
      OR MIN(server."teamId") <> run."teamId"
  ) THEN
    RAISE EXCEPTION 'Cannot assign workspace to ServerRun: run and step targets disagree';
  END IF;
END $$;

ALTER TABLE "ServerRun" ALTER COLUMN "teamId" SET NOT NULL;

ALTER TABLE "ServerRun"
  ADD CONSTRAINT "ServerRun_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ServerRun_teamId_kind_createdAt_idx"
  ON "ServerRun"("teamId", "kind", "createdAt");
