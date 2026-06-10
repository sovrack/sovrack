import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

let container: StartedPostgreSqlContainer | undefined;
let databaseUrl: string | undefined;

const SCHEMA_DIR = join(__dirname, '..', '..', 'prisma');

/**
 * Start a fresh Postgres container and push the current Prisma schema.
 *
 * We use `prisma db push` (not `migrate deploy`) for the e2e suite because
 * the schema may have fields that haven't been migrated yet (the migration
 * chain is tested separately by check-migrations + the production migration
 * job). The e2e tests only care about the schema matching the current code.
 *
 * Idempotent — repeated calls return the same container. Call stop() in
 * globalTeardown to dispose.
 */
export async function startTestDatabase(): Promise<{
  databaseUrl: string;
  container: StartedPostgreSqlContainer;
}> {
  if (container && databaseUrl) {
    return { databaseUrl, container };
  }

  const pg = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('platform_e2e')
    .withUsername('platform')
    .withPassword('test_pwd')
    .withReuse()
    .start();

  const url = pg.getConnectionUri() + '?schema=public';
  container = pg;
  databaseUrl = url;

  pushSchema(url);
  return { databaseUrl: url, container: pg };
}

export async function stopTestDatabase(): Promise<void> {
  if (container) {
    await container.stop();
    container = undefined;
    databaseUrl = undefined;
  }
}

export function getCurrentDatabaseUrl(): string | undefined {
  return databaseUrl;
}

function pushSchema(url: string): void {
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: join(SCHEMA_DIR, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
