import { PrismaClient, Role, ProjectRole, ProjectServiceType } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export type TestFixtures = Awaited<ReturnType<typeof createTestFixtures>>;

/**
 * Seed a minimal-but-realistic platform project tree that exercises the full
 * deployment create flow:
 *   - 1 admin user (with hashed password, full name)
 *   - 1 project with GitLab config
 *   - 1 environment (PRODUCTION) with a verified server + docker installed
 *
 * Returns ids for use in the deployment DTO.
 */
export async function createTestFixtures(prisma: PrismaClient) {
  const userId = randomUUID();
  await prisma.user.create({
    data: {
      id: userId,
      email: `admin-${userId.slice(0, 8)}@platform.test`,
      password: '$2b$10$dummyhashneverusedfore2e',
      fullName: 'E2E Admin',
      role: Role.ADMIN,
    },
  });

  const projectId = randomUUID();
  await prisma.project.create({
    data: {
      id: projectId,
      name: `e2e-project-${projectId.slice(0, 8)}`,
      repoUrl: 'https://gitlab.example.com/platform/e2e',
      branch: 'main',
      appProviderLink: {
        create: {
          providerUrl: 'https://gitlab.example.com/platform/e2e',
          providerToken: 'glpat-e2e-token',
          externalId: BigInt(1),
        },
      },
    },
  });

  await prisma.projectMember.create({
    data: {
      projectId,
      userId,
      role: ProjectRole.OWNER,
    },
  });

  const serverId = randomUUID();
  await prisma.server.create({
    data: {
      id: serverId,
      name: `e2e-server-${serverId.slice(0, 8)}`,
      host: '10.0.0.1',
      port: 22,
      username: 'root',
      sshKey: 'e2e-ssh-private-key',
      isVerified: true,
    },
  });

  await prisma.serverInstalledTool.create({
    data: {
      serverId,
      toolKey: 'docker',
      displayName: 'Docker Engine',
      status: 'INSTALLED',
      version: '24.0.0',
    },
  });

  const environmentId = randomUUID();
  await prisma.environment.create({
    data: {
      id: environmentId,
      name: 'production',
      projectId,
      serverId,
      domain: 'e2e.example.com',
    },
  });

  return {
    userId,
    projectId,
    environmentId,
    serverId,
  };
}

export async function createTestService(
  prisma: PrismaClient,
  args: { projectId: string; buildPack?: string },
) {
  const serviceId = randomUUID();
  await prisma.projectService.create({
    data: {
      id: serviceId,
      projectId: args.projectId,
      name: `e2e-service-${serviceId.slice(0, 8)}`,
      type: ProjectServiceType.BACKEND,
      defaultBranch: 'main',
      externalRepoId: BigInt(2),
      buildPack: (args.buildPack ?? 'DOCKERFILE') as never,
    },
  });
  return serviceId;
}
