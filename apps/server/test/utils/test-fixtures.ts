import {
  PrismaClient,
  Role,
  ProjectRole,
  ServiceType,
  SourceType,
  BuildPack,
  GitProviderType,
  ServerStatus,
  WorkspaceRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

export type TestFixtures = Awaited<ReturnType<typeof createTestFixtures>>;

export async function createTestFixtures(prisma: PrismaClient) {
  const userId = randomUUID();
  await prisma.user.create({
    data: {
      id: userId,
      email: `admin-${userId.slice(0, 8)}@deployautomation.test`,
      password: '$2b$10$dummyhashneverusedfore2e',
      fullName: 'E2E Admin',
      role: Role.OWNER,
      emailVerifiedAt: new Date(),
    },
  });

  // The multi-tenant model scopes servers by team. Give the fixture user a
  // team + membership so scoped read paths (resolveTeamId) resolve to the
  // same team the fixtures' server belongs to.
  const teamId = randomUUID();
  await prisma.team.create({
    data: {
      id: teamId,
      name: `e2e-team-${teamId.slice(0, 8)}`,
      slug: `e2e-team-${teamId}`,
    },
  });
  await prisma.teamMember.create({
    data: { teamId, userId, role: WorkspaceRole.OWNER },
  });

  const projectId = randomUUID();
  await prisma.project.create({
    data: {
      id: projectId,
      name: `e2e-project-${projectId.slice(0, 8)}`,
      teamId,
    },
  });

  await prisma.projectMember.create({
    data: {
      projectId,
      teamId,
      userId,
      role: ProjectRole.MAINTAINER,
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
      teamId,
      // Docker readiness is derived from the installedTools JSON (the legacy
      // hasDocker/hasRunner boolean columns were removed from the schema).
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
      // status + capabilities are what DeploymentPreflightService checks
      // before allowing a deployment to be created (server truly deployable,
      // not just "linked") — a fixture server left at the default NEW status
      // is correctly rejected by the preflight, same as it should be for a
      // real never-prepared server. installedTools above is a SEPARATE field
      // (read by DeploymentsValidationService's tool-detection), unrelated to
      // capabilities (read by serverHasDocker()) — both are populated here.
      status: ServerStatus.PREPARED,
      capabilities: { 'docker.installed': 'true' },
    },
  });

  // The preflight's circuit-breaker check reads DockerConnection.circuitState
  // via a real (unmocked) DockerConnectionsService — a server with no
  // DockerConnection row is correctly treated as "never prepared". The TLS
  // fields are never decrypted by this check, so plain placeholders are fine.
  await prisma.dockerConnection.create({
    data: {
      serverId,
      endpoint: 'tcp://10.0.0.1:2376',
      tlsCaCert: 'e2e-ca',
      tlsClientCert: 'e2e-cert',
      tlsClientKey: 'e2e-key',
      isReachable: true,
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
      teamId,
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
      repoPath: 'deployautomation/e2e',
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
    teamId,
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
      repoPath: 'deployautomation/e2e',
      branch: 'main',
      buildPack: (args.buildPack as BuildPack) ?? BuildPack.DOCKERFILE,
    } as any,
  });
  return serviceId;
}
