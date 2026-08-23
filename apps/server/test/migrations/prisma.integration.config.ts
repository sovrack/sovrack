import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const migrationsPath = process.env.PRISMA_INTEGRATION_MIGRATIONS;
if (!migrationsPath) {
  throw new Error('PRISMA_INTEGRATION_MIGRATIONS is required');
}

export default defineConfig({
  schema: `${process.cwd()}/prisma/schema.prisma`,
  migrations: {
    path: migrationsPath,
  },
});
