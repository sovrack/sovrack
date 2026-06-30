// @ts-nocheck — one-time migration script, safe to run multiple times (idempotent)
//
// Copies ServerPreparation family (B) and ServerOperation family (C) into the
// unified ServerRun / ServerRunStep / ServerRunLog tables.
//
// Safe to re-run: every INSERT uses ON CONFLICT (id) DO NOTHING so rows that
// were already migrated are silently skipped. Run order matters for FKs:
//   1. ServerRun rows (retryOfId=NULL first to avoid self-FK ordering issues)
//   2. ServerRun retryOfId updates
//   3. ServerRunStep rows
//   4. ServerRunLog rows
//
// Usage:
//   npx ts-node --transpile-only prisma/backfill-server-runs.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀  ServerRun backfill starting…');

  // ─── 1. ServerPreparation → ServerRun (PREPARATION) ────────────────────────
  const prepRuns = await prisma.$executeRawUnsafe(`
    INSERT INTO "ServerRun" (
      id, kind, "serverId", "actionKey", "actionLabel", profile, status,
      "triggerSource", "requestedById",
      "paramsJson", "resolvedJson",
      summary, "errorMessage",
      attempts, "maxAttempts", "timeoutMs",
      "retryOfId",
      "startedAt", "finishedAt",
      "createdAt", "updatedAt"
    )
    SELECT
      p.id,
      'PREPARATION'::"ServerRunKind",
      p."serverId",
      NULL,                                -- actionKey (PREPARATION only uses profile)
      NULL,                                -- actionLabel
      p.profile::text,                     -- profile stored as plain string
      p.status::text::"ServerRunStatus",
      p."triggerSource",
      p."requestedById",
      p."selectedOptionsJson",             -- paramsJson
      p."resolvedRolesJson",               -- resolvedJson
      p.summary,
      p."errorMessage",
      0,                                   -- attempts (not tracked on old model)
      1,                                   -- maxAttempts
      NULL,                                -- timeoutMs
      NULL,                                -- retryOfId set below after all rows exist
      p."startedAt",
      p."finishedAt",
      p."createdAt",
      p."updatedAt"
    FROM "ServerPreparation" p
    ON CONFLICT (id) DO NOTHING
  `);
  console.log(`  ✓ ServerPreparation → ServerRun: ${prepRuns} inserted`);

  // ─── 2. ServerOperation → ServerRun (AUTOMATION) ───────────────────────────
  const opRuns = await prisma.$executeRawUnsafe(`
    INSERT INTO "ServerRun" (
      id, kind, "serverId", "actionKey", "actionLabel", profile, status,
      "triggerSource", "requestedById",
      "paramsJson", "resolvedJson",
      summary, "errorMessage",
      attempts, "maxAttempts", "timeoutMs",
      "retryOfId",
      "startedAt", "finishedAt",
      "createdAt", "updatedAt"
    )
    SELECT
      o.id,
      'AUTOMATION'::"ServerRunKind",
      NULL,                                -- AUTOMATION runs target N servers (no single serverId)
      o."actionKey",
      o."actionLabel",
      o.profile,
      o.status::text::"ServerRunStatus",
      o."triggerSource",
      o."requestedById",
      o."paramsJson",
      o."resolvedJson",
      o.summary,
      o."errorMessage",
      o.attempts,
      o."maxAttempts",
      o."timeoutMs",
      NULL,                                -- retryOfId set below
      o."startedAt",
      o."finishedAt",
      o."createdAt",
      o."updatedAt"
    FROM "ServerOperation" o
    ON CONFLICT (id) DO NOTHING
  `);
  console.log(`  ✓ ServerOperation → ServerRun: ${opRuns} inserted`);

  // ─── 3. Update retryOfId (after all parent rows exist) ──────────────────────
  const prepRetry = await prisma.$executeRawUnsafe(`
    UPDATE "ServerRun" sr
    SET "retryOfId" = p."retryOfPreparationId"
    FROM "ServerPreparation" p
    WHERE sr.id = p.id
      AND p."retryOfPreparationId" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "ServerRun" WHERE id = p."retryOfPreparationId")
  `);
  console.log(`  ✓ Preparation retryOfId links: ${prepRetry} updated`);

  const opRetry = await prisma.$executeRawUnsafe(`
    UPDATE "ServerRun" sr
    SET "retryOfId" = o."retryOfId"
    FROM "ServerOperation" o
    WHERE sr.id = o.id
      AND o."retryOfId" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "ServerRun" WHERE id = o."retryOfId")
  `);
  console.log(`  ✓ Operation retryOfId links: ${opRetry} updated`);

  // ─── 4. ServerPreparationTask → ServerRunStep ───────────────────────────────
  const prepSteps = await prisma.$executeRawUnsafe(`
    INSERT INTO "ServerRunStep" (
      id, "runId", "roleKey", "serverId",
      "taskName", "orderIndex", status,
      "startedAt", "finishedAt",
      message, "errorMessage", output,
      "createdAt", "updatedAt"
    )
    SELECT
      t.id,
      t."preparationId",                   -- runId
      t."roleKey",
      NULL,                                -- serverId (PREPARATION steps use roleKey)
      t."taskName",
      t."orderIndex",
      t.status::text::"ServerRunStepStatus",
      t."startedAt",
      t."finishedAt",
      t.message,
      NULL,                                -- errorMessage (not on old model)
      NULL,                                -- output
      t."createdAt",
      t."updatedAt"
    FROM "ServerPreparationTask" t
    ON CONFLICT DO NOTHING
  `);
  console.log(`  ✓ ServerPreparationTask → ServerRunStep: ${prepSteps} inserted`);

  // ─── 5. ServerOperationTarget → ServerRunStep ───────────────────────────────
  const opSteps = await prisma.$executeRawUnsafe(`
    INSERT INTO "ServerRunStep" (
      id, "runId", "roleKey", "serverId",
      "taskName", "orderIndex", status,
      "startedAt", "finishedAt",
      message, "errorMessage", output,
      "createdAt", "updatedAt"
    )
    SELECT
      t.id,
      t."operationId",                     -- runId
      NULL,                                -- roleKey (AUTOMATION steps use serverId)
      t."serverId",
      NULL,                                -- taskName
      0,                                   -- orderIndex (not on old model)
      t.status::text::"ServerRunStepStatus",
      t."startedAt",
      t."finishedAt",
      NULL,                                -- message
      t."errorMessage",
      t.output,
      NOW(),                               -- createdAt (not on old model)
      NOW()                                -- updatedAt
    FROM "ServerOperationTarget" t
    ON CONFLICT DO NOTHING
  `);
  console.log(`  ✓ ServerOperationTarget → ServerRunStep: ${opSteps} inserted`);

  // ─── 6. ServerPreparationLog → ServerRunLog ─────────────────────────────────
  const prepLogs = await prisma.$executeRawUnsafe(`
    INSERT INTO "ServerRunLog" (
      id, "runId", "serverId", level, source, message, "lineNumber", "createdAt"
    )
    SELECT
      l.id,
      l."preparationId",                   -- runId
      NULL,                                -- serverId (single-server run, no per-log server)
      l.level,
      l.source,
      l.message,
      l."lineNumber",
      l."createdAt"
    FROM "ServerPreparationLog" l
    ON CONFLICT (id) DO NOTHING
  `);
  console.log(`  ✓ ServerPreparationLog → ServerRunLog: ${prepLogs} inserted`);

  // ─── 7. ServerOperationLog → ServerRunLog ───────────────────────────────────
  const opLogs = await prisma.$executeRawUnsafe(`
    INSERT INTO "ServerRunLog" (
      id, "runId", "serverId", level, source, message, "lineNumber", "createdAt"
    )
    SELECT
      l.id,
      l."operationId",                     -- runId
      l."serverId",
      l.level,
      l.source,
      l.message,
      l."lineNumber",
      l."createdAt"
    FROM "ServerOperationLog" l
    ON CONFLICT (id) DO NOTHING
  `);
  console.log(`  ✓ ServerOperationLog → ServerRunLog: ${opLogs} inserted`);

  // ─── Summary ─────────────────────────────────────────────────────────────────
  const totals = await prisma.$queryRawUnsafe<Array<{ cnt: bigint; tbl: string }>>(`
    SELECT COUNT(*) as cnt, 'ServerRun'     as tbl FROM "ServerRun"     UNION ALL
    SELECT COUNT(*),        'ServerRunStep'         FROM "ServerRunStep" UNION ALL
    SELECT COUNT(*),        'ServerRunLog'          FROM "ServerRunLog"
  `);
  for (const row of totals) {
    console.log(`  📊  ${row.tbl}: ${row.cnt} total rows`);
  }

  console.log('✅  Backfill complete.');
}

main()
  .catch((e) => {
    console.error('❌  Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
