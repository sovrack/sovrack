import {
  startTestDatabase,
  stopTestDatabase,
} from './utils/postgres-container';

export default async function globalSetup(): Promise<void> {
  process.env.JWT_SECRET = 'a'.repeat(64);
  process.env.JWT_EXPIRES_IN = '24h';
  process.env.STAFF_JWT_SECRET = 'c'.repeat(64);
  process.env.STAFF_JWT_EXPIRES_IN = '2h';
  process.env.CONFIG_SECRET = 'b'.repeat(64);
  process.env.FRONTEND_URL = 'http://localhost:3000';
  process.env.GITLAB_WEBHOOK_AUTO_CONFIGURE = 'false';
  process.env.NODE_ENV = 'test';
  // Reuse the application's explicit no-external-Redis mode. Queue providers
  // and workers are replaced by deterministic doubles in setup-e2e.ts; this
  // also prevents the Redis-backed throttler/abort channels from loading a
  // developer's .env and turning every request into a retry timeout.
  process.env.OPENAPI_EXPORT = 'true';
  // E2E drives deployment execution through explicit test doubles. Starting
  // real BullMQ consumers would race the fixtures and make one suite delete
  // records while another background execution is still finishing.
  process.env.PROCESS_ROLE = 'api';

  // In GitLab CI, a `postgres` service is already up and migrated (the
  // `prisma migrate deploy` step runs right before this suite) — reuse it.
  // Spinning up our own Testcontainers Postgres instead needs a Docker
  // daemon reachable from inside the job container; on the "docker" executor
  // the spun-up container is a network sibling, never reachable on
  // localhost, so the wait strategy times out after 120s (real failure seen
  // on pipeline #27885 / job #129657).
  if (process.env.CI || process.env.GITLAB_CI) {
    if (process.env.DATABASE_URL) {
      console.log(
        `[e2e] Using CI-provided Postgres at ${process.env.DATABASE_URL}`,
      );
    } else {
      console.warn(
        '[e2e] CI detected but DATABASE_URL is not set — e2e tests will likely fail with a connection error',
      );
    }
    return;
  }

  const { databaseUrl } = await startTestDatabase();
  process.env.DATABASE_URL = databaseUrl;
  console.log(`[e2e] Postgres ready at ${databaseUrl}`);
}

export async function globalTeardown(): Promise<void> {
  await stopTestDatabase();
}
