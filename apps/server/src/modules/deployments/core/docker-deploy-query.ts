import { Prisma } from '@prisma/client';

/** Stable projection required by the Docker deployment executor. */
export const dockerDeployInclude = Prisma.validator<Prisma.DeploymentInclude>()(
  {
    project: { select: { id: true, name: true } },
    service: {
      select: {
        id: true,
        name: true,
        port: true,
        env: true,
        secretsEnv: true,
        dockerComposeContent: true,
        repoPath: true,
        branch: true,
        startCommand: true,
        type: true,
        databaseType: true,
        databaseVersion: true,
        databaseCredentials: true,
        externalPort: true,
        healthcheckPath: true,
        cpuLimit: true,
        memLimitMb: true,
        replicas: true,
        preDeployCommand: true,
        preDeployTimeout: true,
        shutdownTimeout: true,
        buildPack: true,
        dockerfile: true,
        nixpacksConfig: true,
        staticConfig: true,
        rootDir: true,
        volumes: { select: { name: true, mountPath: true } },
        provider: { select: { providerUrl: true, adminToken: true } },
      },
    },
    serviceEnv: {
      include: {
        environment: {
          select: {
            id: true,
            name: true,
            env: true,
            secretsEnv: true,
            servers: {
              where: { isActive: true, isVerified: true },
              select: { id: true, name: true, host: true },
            },
          },
        },
      },
    },
    environment: {
      select: { id: true, name: true, env: true, secretsEnv: true },
    },
    user: { select: { id: true, email: true, fullName: true, role: true } },
    build: {
      select: {
        id: true,
        imageSha: true,
        buildPack: true,
        isLocalBuild: true,
      },
    },
  },
);
