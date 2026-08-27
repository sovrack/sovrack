import { stopTestDatabase } from './utils/postgres-container';

export default async function globalTeardown(): Promise<void> {
  await stopTestDatabase();
}
