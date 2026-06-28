import {
  startTestDatabase,
  stopTestDatabase,
} from './utils/postgres-container';

export default async function globalSetup(): Promise<void> {
  const { databaseUrl } = await startTestDatabase();
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'a'.repeat(64);
  process.env.JWT_EXPIRES_IN = '24h';
  process.env.CONFIG_SECRET = 'b'.repeat(64);
  process.env.FRONTEND_URL = 'http://localhost:3000';
  process.env.GITLAB_WEBHOOK_AUTO_CONFIGURE = 'false';
  process.env.NODE_ENV = 'test';

  console.log(`[e2e] Postgres ready at ${databaseUrl}`);
}

export async function globalTeardown(): Promise<void> {
  await stopTestDatabase();
}
