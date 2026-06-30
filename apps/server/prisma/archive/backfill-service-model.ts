// @ts-nocheck — one-time migration script, references old schema shapes
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting backfill: Config → Project.env');
  await backfillProjectEnv();
  console.log('✅ Project.env backfilled');

  console.log('🚀 Starting backfill: EnvironmentConfig → Environment.env');
  await backfillEnvironmentEnv();
  console.log('✅ Environment.env backfilled');

  console.log('🚀 Starting backfill: ProjectService + AppProviderLink → Service');
  await backfillServices();
  console.log('✅ Services backfilled');

  console.log('🚀 Starting backfill: ManagedService → Service (type=DATABASE)');
  await backfillManagedServices();
  console.log('✅ Managed services backfilled');

  console.log('🎉 All backfills complete!');
}

async function backfillProjectEnv() {
  const projects = await prisma.project.findMany({
    include: { configs: true },
  });

  for (const project of projects) {
    if (project.configs.length === 0) continue;

    const envVars: Record<string, { value: string; isSecret: boolean }> = {};
    for (const config of project.configs) {
      envVars[config.key] = { value: config.value, isSecret: config.isSecret };
    }

    await prisma.project.update({
      where: { id: project.id },
      data: { env: JSON.stringify(envVars) },
    });
  }
}

async function backfillEnvironmentEnv() {
  const environments = await prisma.environment.findMany({
    include: { configs: true },
  });

  for (const env of environments) {
    if (env.configs.length === 0) continue;

    const envVars: Record<string, { value: string; isSecret: boolean }> = {};
    for (const config of env.configs) {
      envVars[config.key] = { value: config.value, isSecret: config.isSecret };
    }

    await prisma.environment.update({
      where: { id: env.id },
      data: { env: JSON.stringify(envVars) },
    });
  }
}

async function backfillServices() {
  const projects = await prisma.project.findMany({
    include: {
      appProviderLink: true,
      services: true,
      environments: true,
    },
  });

  for (const project of projects) {
    const envs = project.environments;
    if (envs.length === 0) continue;
    const firstEnv = envs[0];

    // For each ProjectService, create a Service in each environment
    // (or link to the first environment if no service-targets exist)
    for (const ps of project.services) {
      // Find which environments this service is assigned to
      const targets = await prisma.environmentServiceTarget.findMany({
        where: { serviceId: ps.id },
        include: { environment: true },
      });

      const targetEnvs = targets.length > 0
        ? targets.map((t) => t.environment)
        : envs;

      for (const env of targetEnvs) {
        const existing = await prisma.service.findFirst({
          where: { environmentId: env.id, name: ps.name },
        });
        if (existing) continue;

        const target = targets.find((t) => t.environmentId === env.id);

        await prisma.service.create({
          data: {
            name: ps.name,
            type: 'APPLICATION',
            description: `Migrated from ProjectService (${ps.type})`,
            sourceType: ps.repositoryPath ? 'GIT' : 'NONE',
            repoUrl: ps.repositoryPath
              ? `${project.appProviderLink?.providerUrl ?? ''}/${ps.repositoryPath}`
              : project.repoUrl,
            branch: ps.defaultBranch,
            providerId: ps.sourceProviderId,
            rootDir: ps.rootDir ?? '/',
            buildPack: ps.buildPack,
            dockerfile: ps.dockerfilePath !== 'Dockerfile' ? ps.dockerfileContent : undefined,
            port: target?.port ?? project.buildPort ?? project.port,
            startCommand: project.buildStartCmd,
            nixpacksConfig: ps.nixpacksConfig ?? project.nixpacksConfig,
            staticConfig: ps.staticConfig ?? project.staticConfig,
            dockerComposeContent: ps.dockerComposeContent ?? project.dockerComposeContent,
            composeServiceName: ps.composeServiceName,
            healthcheckPath: target?.healthcheckPath,
            replicas: target?.replicas ?? 1,
            environmentId: env.id,
          },
        });
      }
    }

    // If the project has a direct AppProviderLink (REPO mode) but no ProjectServices
    // create a service from the project's own fields
    if (project.appProviderLink && project.services.length === 0) {
      for (const env of envs) {
        const existing = await prisma.service.findFirst({
          where: { environmentId: env.id, name: project.name },
        });
        if (existing) continue;

        await prisma.service.create({
          data: {
            name: project.name,
            type: 'APPLICATION',
            description: `Migrated from project ${project.name}`,
            sourceType: project.appProviderLink.sourceType === 'GROUP' ? 'NONE' : 'GIT',
            repoUrl: project.repoUrl,
            branch: project.branch,
            providerId: project.appProviderLink.providerId,
            buildPack: project.dockerfileContent ? 'DOCKERFILE' : 'NONE',
            dockerfile: project.dockerfileContent,
            port: project.port,
            startCommand: project.buildStartCmd,
            nixpacksConfig: project.nixpacksConfig,
            staticConfig: project.staticConfig,
            dockerComposeContent: project.dockerComposeContent,
            environmentId: env.id,
          },
        });
      }
    }
  }
}

async function backfillManagedServices() {
  const managedServices = await prisma.managedService.findMany({
    include: { environment: true },
  });

  for (const ms of managedServices) {
    const existing = await prisma.service.findFirst({
      where: {
        environmentId: ms.environmentId,
        name: ms.name,
        type: 'DATABASE',
      },
    });
    if (existing) continue;

    await prisma.service.create({
      data: {
        name: ms.name,
        type: 'DATABASE',
        description: `Migrated from ManagedService (${ms.type})`,
        databaseType: ms.type,
        databaseVersion: ms.version,
        port: ms.port,
        databaseCredentials: ms.credentials,
        environmentId: ms.environmentId,
      },
    });
  }
}

main()
  .catch((e) => {
    console.error('❌ Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
