/**
 * HISTORICAL MIGRATION — ran once before migration drop_deployment_legacy_build_fields.
 * The legacy columns (buildStrategy, buildMode, buildStatus, buildLog) no longer exist
 * on the Deployment table. This script is kept for audit trail only; it will always
 * find 0 deployments to backfill because all rows already have a buildId.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const count = await prisma.deployment.count({ where: { buildId: null } });
  console.log(`Deployments sans buildId: ${count}`);
  if (count === 0) {
    console.log('Nothing to backfill.');
    return;
  }
  console.warn('Unexpected: deployments without buildId found after migration. Manual intervention required.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
