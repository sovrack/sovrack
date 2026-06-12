import { PrismaClient, Role, ProjectRole, ServiceType, SourceType, BuildPack } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export type TestFixtures = Awaited<ReturnType<typeof createTestFixtures>>;

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
    },
  });

  // Link server to environment
  await prisma.server.update({
    where: { id: serverId },
    data: { environmentId },
  });

  const serviceId = randomUUID();
  await prisma.service.create({
    data: {
      id: serviceId,
      projectId,
      name: `e2e-service-${serviceId.slice(0, 8)}`,
      type: ServiceType.APPLICATION,
      sourceType: SourceType.GIT,
      repoPath: 'platform/e2e',
      branch: 'main',
      buildPack: BuildPack.DOCKERFILE,
    },
  });

  const serviceEnvId = randomUUID();
  await prisma.serviceEnvironment.create({
    data: {
      id: serviceEnvId,
      serviceId,
      environmentId,
    },
  });

  return {
    userId,
    projectId,
    environmentId,
    serverId,
    serviceId,
    serviceEnvId,
  };
}

export async function createTestService(
  prisma: PrismaClient,
  args: { environmentId: string; buildPack?: string; projectId: string },
) {
  const serviceId = randomUUID();
  await prisma.service.create({
    data: {
      id: serviceId,
      projectId: args.projectId,
      environmentId: args.environmentId,
      name: `e2e-service-${serviceId.slice(0, 8)}`,
      type: ServiceType.APPLICATION,
      sourceType: SourceType.GIT,
      repoPath: 'platform/e2e',
      branch: 'main',
      buildPack: (args.buildPack as BuildPack) ?? BuildPack.DOCKERFILE,
    } as any,
  });
  return serviceId;
}
