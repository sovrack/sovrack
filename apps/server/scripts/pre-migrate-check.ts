/**
 * Pre-migration safety gate. Run BEFORE `prisma migrate deploy` (wired as
 * `npm run db:migrate:safe`).
 *
 * For every DESTRUCTIVE migration that is still PENDING (declared in the
 * migrations folder but not yet recorded in `_prisma_migrations`), it runs a
 * set of precondition queries that must all return 0 problem rows — typically
 * "no orphan FK / data not yet backfilled". If any precondition fails, the
 * script prints an actionable report and exits 1 so the migration does NOT run.
 *
 * Safe to run on a fully-migrated database: pending destructive migrations = 0
 * → "nothing to check" → exit 0.
 *
 * See prisma/MIGRATION_RUNBOOK.md for the human procedure.
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

interface Precondition {
  description: string;
  /** SQL returning a single integer column `c` = number of PROBLEM rows (must be 0). */
  sql: string;
}

interface DestructiveMigration {
  name: string;
  drops: string;
  backfillBefore: string[];
  preconditions: Precondition[];
}

const DESTRUCTIVE_MIGRATIONS: DestructiveMigration[] = [
  {
    name: '20260610130000_drop_old_models',
    drops: 'Config, EnvironmentConfig, ProjectService, EnvironmentServiceTarget, ManagedService, GitlabConfig (+ legacy columns)',
    backfillBefore: ['backfill-service-model.ts', 'backfill-fk-references.ts'],
    preconditions: [
      {
        description: 'Deployments whose serviceId points to a missing Service (FK backfill incomplete)',
        sql: `SELECT count(*)::int AS c FROM "Deployment" d
                WHERE d."serviceId" IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM "Service" s WHERE s.id = d."serviceId")`,
      },
      {
        description: 'Builds whose serviceId points to a missing Service (FK backfill incomplete)',
        sql: `SELECT count(*)::int AS c FROM "Build" b
                WHERE b."serviceId" IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM "Service" s WHERE s.id = b."serviceId")`,
      },
    ],
  },
  {
    name: '20260612154050_drop_serviceenvironment_repopath',
    drops: 'ServiceEnvironment.repoPath',
    backfillBefore: [],
    preconditions: [
      {
        description: 'ServiceEnvironment.repoPath values not reflected on the linked Service.repoPath',
        sql: `SELECT count(*)::int AS c FROM "ServiceEnvironment" se
                WHERE se."repoPath" IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM "Service" s
                     WHERE s.id = se."serviceId" AND s."repoPath" = se."repoPath")`,
      },
    ],
  },
  {
    name: '20260612154424_drop_project_env',
    drops: 'Project.env',
    backfillBefore: ['backfill-service-model.ts'],
    preconditions: [
      {
        description: 'Projects with a non-empty env that has no Service yet (data would be lost)',
        sql: `SELECT count(*)::int AS c FROM "Project" p
                WHERE p.env IS NOT NULL AND p.env <> '' AND p.env <> '{}'
                  AND NOT EXISTS (SELECT 1 FROM "Service" s WHERE s."projectId" = p.id)`,
      },
    ],
  },
];

const MIGRATIONS_DIR = join(__dirname, '..', 'prisma', 'migrations');

function localMigrationNames(): string[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

async function appliedMigrationNames(): Promise<Set<string>> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
    );
    return new Set(rows.map((r) => r.migration_name));
  } catch {
    // Table absent → brand-new DB, nothing applied yet.
    return new Set<string>();
  }
}

async function countProblems(precondition: Precondition): Promise<number | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ c: number }>>(precondition.sql);
    return rows[0]?.c ?? 0;
  } catch (error: unknown) {
    // A referenced relation/column may already be gone → cannot evaluate.
    const message = error instanceof Error ? error.message : 'unknown error';
    console.warn(`  ⚠️  could not evaluate ("${precondition.description}"): ${message}`);
    return null;
  }
}

async function main(): Promise<void> {
  const local = new Set(localMigrationNames());
  const applied = await appliedMigrationNames();

  const pendingDestructive = DESTRUCTIVE_MIGRATIONS.filter(
    (m) => local.has(m.name) && !applied.has(m.name),
  );

  if (pendingDestructive.length === 0) {
    console.log('[pre-migrate] ✅ No pending destructive migrations — safe to deploy.');
    return;
  }

  console.log(
    `[pre-migrate] Checking ${pendingDestructive.length} pending destructive migration(s)...`,
  );

  let failed = false;
  for (const migration of pendingDestructive) {
    console.log(`\n• ${migration.name} — drops: ${migration.drops}`);
    if (migration.backfillBefore.length > 0) {
      console.log(`  ↳ backfill required first: ${migration.backfillBefore.join(' then ')}`);
    }
    for (const precondition of migration.preconditions) {
      const problems = await countProblems(precondition);
      if (problems === null) {
        continue;
      }
      if (problems > 0) {
        failed = true;
        console.error(`  ❌ ${precondition.description}: ${problems} problem row(s)`);
      } else {
        console.log(`  ✓ ${precondition.description}: ok`);
      }
    }
  }

  if (failed) {
    console.error(
      '\n[pre-migrate] ❌ Preconditions failed. Run the required backfill scripts ' +
        '(see prisma/MIGRATION_RUNBOOK.md), then retry. Migration aborted.',
    );
    process.exitCode = 1;
  } else {
    console.log('\n[pre-migrate] ✅ All preconditions satisfied — safe to deploy.');
  }
}

main()
  .catch((error: unknown) => {
    console.error('[pre-migrate] Unexpected error:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
