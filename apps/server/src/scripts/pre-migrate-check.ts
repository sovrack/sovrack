/**
 * Release migration safety gate.
 *
 * This script runs before `prisma migrate deploy`, so every query must be
 * compatible with the schema that is currently installed, not only with the
 * schema produced by the pending migrations. Destructive migrations fail
 * closed when a precondition cannot be evaluated.
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

type Precondition = {
  description: string;
  sql: string;
};

type GuardedMigration = {
  name: string;
  changes: string;
  backfillBefore: string[];
  preconditions: Precondition[];
};

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');

function localMigrationNames(): Set<string> {
  if (!existsSync(MIGRATIONS_DIR)) return new Set<string>();
  return new Set(
    readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );
}

async function appliedMigrationNames(): Promise<Set<string>> {
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ migration_name: string }>
    >(
      `SELECT migration_name
       FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL`,
    );
    return new Set(rows.map((row) => row.migration_name));
  } catch {
    return new Set<string>();
  }
}

async function relationExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ present: boolean }>>(
    `SELECT to_regclass($1) IS NOT NULL AS present`,
    `public."${name}"`,
  );
  return rows[0]?.present === true;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ present: boolean }>>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2
     ) AS present`,
    table,
    column,
  );
  return rows[0]?.present === true;
}

async function countProblems(check: Precondition): Promise<number | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ c: number }>>(check.sql);
    return rows[0]?.c ?? 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.warn(`  could not evaluate ("${check.description}"): ${message}`);
    return null;
  }
}

function phase2SecurityMigration(
  workspaceMembershipFieldsExist: boolean,
): GuardedMigration {
  const ownerInvariant = workspaceMembershipFieldsExist
    ? {
        description: 'active workspaces without at least one active OWNER',
        sql: `SELECT count(*)::int AS c
              FROM "Team" t
              WHERE NOT EXISTS (
                SELECT 1
                FROM "TeamMember" tm
                WHERE tm."teamId" = t.id
                  AND tm.role = 'OWNER'
                  AND tm.status = 'ACTIVE'
              )`,
      }
    : {
        description:
          'legacy workspaces without a member that can become the initial OWNER',
        sql: `SELECT count(*)::int AS c
              FROM "Team" t
              WHERE NOT EXISTS (
                SELECT 1 FROM "TeamMember" tm WHERE tm."teamId" = t.id
              )`,
      };

  return {
    name: '20260818120000_phase2_security_invariants',
    changes:
      'webhook delivery deduplication and project-scoped pipeline uniqueness',
    backfillBefore: ['npm run db:encrypt-credentials'],
    preconditions: [
      ownerInvariant,
      {
        description:
          'active DATABASE services whose credentials are absent or not encrypted with the v2 format',
        sql: `SELECT count(*)::int AS c
              FROM "Service" s
              WHERE s.type = 'DATABASE'
                AND s."archivedAt" IS NULL
                AND (
                  s."databaseCredentials" IS NULL
                  OR jsonb_typeof(s."databaseCredentials") <> 'string'
                  OR trim(both '"' from s."databaseCredentials"::text) NOT LIKE 'v2:%'
                )`,
      },
    ],
  };
}

function guardedMigrations(
  workspaceMembershipFieldsExist: boolean,
): GuardedMigration[] {
  return [
    phase2SecurityMigration(workspaceMembershipFieldsExist),
    {
      name: '20260610130000_drop_old_models',
      changes:
        'legacy Config, EnvironmentConfig, ProjectService, EnvironmentServiceTarget, ManagedService and GitlabConfig structures',
      backfillBefore: [
        'backfill-service-model.ts',
        'backfill-fk-references.ts',
      ],
      preconditions: [
        {
          description:
            'deployments whose serviceId points to a missing Service',
          sql: `SELECT count(*)::int AS c
                FROM "Deployment" d
                WHERE d."serviceId" IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM "Service" s WHERE s.id = d."serviceId"
                  )`,
        },
        {
          description: 'builds whose serviceId points to a missing Service',
          sql: `SELECT count(*)::int AS c
                FROM "Build" b
                WHERE b."serviceId" IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM "Service" s WHERE s.id = b."serviceId"
                  )`,
        },
      ],
    },
    {
      name: '20260612154050_drop_serviceenvironment_repopath',
      changes: 'ServiceEnvironment.repoPath',
      backfillBefore: [],
      preconditions: [
        {
          description:
            'ServiceEnvironment.repoPath values not reflected on the linked Service',
          sql: `SELECT count(*)::int AS c
                FROM "ServiceEnvironment" se
                WHERE se."repoPath" IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1
                    FROM "Service" s
                    WHERE s.id = se."serviceId"
                      AND s."repoPath" = se."repoPath"
                  )`,
        },
      ],
    },
    {
      name: '20260612154424_drop_project_env',
      changes: 'Project.env',
      backfillBefore: ['backfill-service-model.ts'],
      preconditions: [
        {
          description:
            'projects with a non-empty env that have no Service to receive it',
          sql: `SELECT count(*)::int AS c
                FROM "Project" p
                WHERE p.env IS NOT NULL
                  AND p.env <> ''
                  AND p.env <> '{}'
                  AND NOT EXISTS (
                    SELECT 1 FROM "Service" s WHERE s."projectId" = p.id
                  )`,
        },
      ],
    },
  ];
}

async function main(): Promise<void> {
  if (!(await relationExists('Team'))) {
    console.log(
      '[pre-migrate] New database: no existing tenant data can be lost.',
    );
    return;
  }

  const [roleExists, statusExists, applied] = await Promise.all([
    columnExists('TeamMember', 'role'),
    columnExists('TeamMember', 'status'),
    appliedMigrationNames(),
  ]);
  const local = localMigrationNames();
  const pending = guardedMigrations(roleExists && statusExists).filter(
    (migration) => local.has(migration.name) && !applied.has(migration.name),
  );

  if (pending.length === 0) {
    console.log('[pre-migrate] No pending guarded migration.');
    return;
  }

  console.log(
    `[pre-migrate] Checking ${pending.length} guarded migration(s)...`,
  );
  let failed = false;

  for (const migration of pending) {
    console.log(`\n- ${migration.name}: ${migration.changes}`);
    if (migration.backfillBefore.length > 0) {
      console.log(
        `  required before migration: ${migration.backfillBefore.join(' then ')}`,
      );
    }

    for (const check of migration.preconditions) {
      const problems = await countProblems(check);
      if (problems === null) {
        failed = true;
        console.error(`  FAIL ${check.description}: check could not run`);
      } else if (problems > 0) {
        failed = true;
        console.error(`  FAIL ${check.description}: ${problems} row(s)`);
      } else {
        console.log(`  OK ${check.description}`);
      }
    }
  }

  if (failed) {
    throw new Error(
      'Migration preconditions failed. Complete the documented mappings/backfills and retry.',
    );
  }

  console.log('\n[pre-migrate] All preconditions satisfied.');
}

void main()
  .catch((error: unknown) => {
    console.error('[pre-migrate] Failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
