import { PrismaClient, Role, ProjectRole, ServiceType, SourceType, BuildPack, GitProviderType } from '@prisma/client';
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
      // Docker readiness now lives on the Server JSON columns (the former
      // ServerInstalledTool join table was removed in Sprint 3).
      hasDocker: true,
      installedTools: [
        {
          toolKey: 'docker',
          displayName: 'Docker Engine',
          version: '24.0.0',
          installedBy: 'e2e',
          status: 'INSTALLED',
          installedAt: new Date().toISOString(),
        },
      ],
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

  // A Git provider config linked to the service so REGISTRY build sources
  // (which resolve the provider via SourceProvidersService.forProject) can
  // trigger the downstream CI pipeline. Name is unique per call to respect the
  // @@unique([type, name]) constraint across repeated fixture creations.
  const providerId = randomUUID();
  await prisma.gitProviderConfig.create({
    data: {
      id: providerId,
      name: `e2e-gitlab-${providerId.slice(0, 8)}`,
      type: GitProviderType.GITLAB,
      providerUrl: 'https://gitlab.example.com',
    },
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
      providerId,
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
