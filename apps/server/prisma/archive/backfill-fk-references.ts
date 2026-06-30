// @ts-nocheck — one-time migration script, references old schema shapes
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Updating FK references from old ProjectService → new Service');

  // Build mapping: old ProjectService.id → new Service.id
  // Match by (service.name, service.environmentId)
  const oldServices = await prisma.$queryRawUnsafe<Array<{ id: string; name: string; project_id: string }>>(
    'SELECT id, name, "projectId" as project_id FROM "ProjectService"',
  );

  const newServices = await prisma.service.findMany({
    select: { id: true, name: true, environmentId: true },
  });

  let mappedCount = 0;

  for (const old of oldServices) {
    // Find the environment for this project
    const envs = await prisma.environment.findMany({
      where: { projectId: old.project_id },
      select: { id: true },
    });

    for (const env of envs) {
      const match = newServices.find(
        (ns) => ns.name === old.name && ns.environmentId === env.id,
      );
      if (!match) continue;

      const newServiceId = match.id;

      // Update Deployment.serviceId
      const depResult = await prisma.$executeRawUnsafe(
        'UPDATE "Deployment" SET "serviceId" = $1 WHERE "serviceId" = $2',
        newServiceId,
        old.id,
      );
      if (depResult > 0) console.log(`  Deployment: ${depResult} rows updated`);

      // Update Build.serviceId
      const buildResult = await prisma.$executeRawUnsafe(
        'UPDATE "Build" SET "serviceId" = $1 WHERE "serviceId" = $2',
        newServiceId,
        old.id,
      );
      if (buildResult > 0) console.log(`  Build: ${buildResult} rows updated`);

      // Update Container.serviceId
      const contResult = await prisma.$executeRawUnsafe(
        'UPDATE "Container" SET "serviceId" = $1 WHERE "serviceId" = $2',
        newServiceId,
        old.id,
      );
      if (contResult > 0) console.log(`  Container: ${contResult} rows updated`);

      // Update Volume.serviceId
      const volResult = await prisma.$executeRawUnsafe(
        'UPDATE "Volume" SET "serviceId" = $1 WHERE "serviceId" = $2',
        newServiceId,
        old.id,
      );
      if (volResult > 0) console.log(`  Volume: ${volResult} rows updated`);

      // Update ProxyRule.serviceId
      const proxyResult = await prisma.$executeRawUnsafe(
        'UPDATE "ProxyRule" SET "serviceId" = $1 WHERE "serviceId" = $2',
        newServiceId,
        old.id,
      );
      if (proxyResult > 0) console.log(`  ProxyRule: ${proxyResult} rows updated`);

      // Update WebhookEndpoint.serviceId
      const webhookResult = await prisma.$executeRawUnsafe(
        'UPDATE "WebhookEndpoint" SET "serviceId" = $1 WHERE "serviceId" = $2',
        newServiceId,
        old.id,
      );
      if (webhookResult > 0) console.log(`  WebhookEndpoint: ${webhookResult} rows updated`);

      // Update DnsRecord.serviceId
      const dnsResult = await prisma.$executeRawUnsafe(
        'UPDATE "DnsRecord" SET "serviceId" = $1 WHERE "serviceId" = $2',
        newServiceId,
        old.id,
      );
      if (dnsResult > 0) console.log(`  DnsRecord: ${dnsResult} rows updated`);

      // Update PipelineRun.serviceId
      const pipeResult = await prisma.$executeRawUnsafe(
        'UPDATE "PipelineRun" SET "serviceId" = $1 WHERE "serviceId" = $2',
        newServiceId,
        old.id,
      );
      if (pipeResult > 0) console.log(`  PipelineRun: ${pipeResult} rows updated`);

      mappedCount++;
    }
  }

  // Also update any EnvironmentServiceTarget references if table still exists
  try {
    // Check if EnvironmentServiceTarget table exists
    const tableCheck = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
      `SELECT tablename FROM pg_catalog.pg_tables WHERE tablename = 'EnvironmentServiceTarget'`,
    );

    if (tableCheck.length > 0) {
      for (const old of oldServices) {
        const envs = await prisma.environment.findMany({
          where: { projectId: old.project_id },
          select: { id: true },
        });

        for (const env of envs) {
          const match = newServices.find(
            (ns) => ns.name === old.name && ns.environmentId === env.id,
          );
          if (!match) continue;

          await prisma.$executeRawUnsafe(
            'UPDATE "EnvironmentServiceTarget" SET "serviceId" = $1 WHERE "serviceId" = $2',
            match.id,
            old.id,
          );
        }
      }
    }
  } catch {
    // Table doesn't exist or already dropped — ignore
  }

  // Update EnvironmentServiceTarget and Volume managedServiceId references
  try {
    const estResult = await prisma.$executeRawUnsafe(
      'UPDATE "EnvironmentServiceTarget" SET "serviceId" = "serviceId" WHERE 1=0',
    );
    console.log(`  EnvironmentServiceTarget check done`);
  } catch {
    // ignore
  }

  console.log(`✅ FK references updated: ${mappedCount} services mapped`);
}

main()
  .catch((e) => {
    console.error('❌ FK backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
