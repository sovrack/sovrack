import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

const execFileMock = jest.fn(
  (
    _file: string,
    _args: string[],
    _opts: unknown,
    cb: (e: Error | null, r: { stdout: string; stderr: string }) => void,
  ) => cb(null, { stdout: 'abc123\trefs/heads/main', stderr: '' }),
);
jest.mock('child_process', () => ({ execFile: execFileMock }));
jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));
// Mocking child_process above shadows the real module that @prisma/client's
// generated platform-detection code needs at import time — replace the client
// with plain enum objects (the only things this service actually reads).
jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  BuildPack: { NIXPACKS: 'NIXPACKS', BUILDPACK: 'BUILDPACK', DOCKERFILE: 'DOCKERFILE', DOCKER_COMPOSE: 'DOCKER_COMPOSE', STATIC: 'STATIC', NONE: 'NONE' },
  CircuitState: { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' },
  ServerStatus: {
    NEW: 'NEW',
    SSH_PENDING: 'SSH_PENDING',
    SSH_VALIDATED: 'SSH_VALIDATED',
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    INFO_DETECTED: 'INFO_DETECTED',
    PREPARATION_PENDING: 'PREPARATION_PENDING',
    PREPARING: 'PREPARING',
    PREPARED: 'PREPARED',
    PARTIALLY_PREPARED: 'PARTIALLY_PREPARED',
    PREPARATION_FAILED: 'PREPARATION_FAILED',
    UNREACHABLE: 'UNREACHABLE',
    DISABLED: 'DISABLED',
  },
  ServiceType: { APPLICATION: 'APPLICATION', DATABASE: 'DATABASE', WORKER: 'WORKER', CRON: 'CRON' },
}));

import { DeploymentPreflightService } from './deployment-preflight.service';
import type { PrismaService } from '../../../shared/database/prisma.service';
import type { DeploymentsConfigResolver } from '../query/deployments-config-resolver.service';
import type { SourceProvidersService } from '../../source-providers/source-providers.service';
import type { DockerConnectionsService } from '../../../adapters/container-runtime/docker-connections.service';
import type { CryptoService } from '../../../shared/crypto/crypto.service';
import type { RegistryAuthService } from './registry-auth.service';
import type { ContainerLifecycleService } from './container-lifecycle.service';

describe('DeploymentPreflightService.assertDeployable', () => {
  let prisma: {
    serviceEnvironment: { findUnique: jest.Mock };
    server: { findUnique: jest.Mock };
    domain: { findFirst: jest.Mock };
    platformConfig: { findUnique: jest.Mock };
  };
  let configResolver: { resolve: jest.Mock };
  let gitProviders: { forService: jest.Mock; forProject: jest.Mock };
  let dockerConnections: { findForServer: jest.Mock };
  let crypto: { decryptSafe: jest.Mock };
  let registryAuth: { resolveAuthForImage: jest.Mock };
  let containerLifecycle: { assertNoForeignPortConflict: jest.Mock };
  let service: DeploymentPreflightService;

  const baseServer = () => ({
    id: 'srv-1',
    name: 'srv-1',
    host: '10.0.0.5',
    isActive: true,
    isVerified: true,
    status: 'PREPARED',
    capabilities: { 'docker.installed': 'true' },
  });

  const baseService = () => ({
    id: 'svc-1',
    name: 'svc-1',
    type: 'APPLICATION',
    port: 3000,
    buildPack: 'DOCKERFILE',
    buildMode: 'LOCAL',
    sourceType: 'GIT',
    repoPath: 'group/repo',
    dockerComposeContent: null,
    secretsEnv: null,
    databaseType: null,
    databaseCredentials: null,
  });

  const baseServiceEnv = (overrides: Record<string, unknown> = {}) => ({
    id: 'se-1',
    archivedAt: null,
    secretsEnv: null,
    server: null,
    service: baseService(),
    environment: {
      id: 'env-1',
      name: 'production',
      secretsEnv: null,
      servers: [baseServer()],
      project: { id: 'proj-1', name: 'proj' },
    },
    ...overrides,
  });

  const gitProvider = () => ({
    readFile: jest.fn().mockResolvedValue('FROM node:20'),
    resolveGitCredentials: jest.fn().mockResolvedValue({
      repoUrl: 'https://gitlab.example.com/g/r.git',
      token: 't',
    }),
  });

  beforeEach(() => {
    execFileMock.mockClear();
    prisma = {
      serviceEnvironment: { findUnique: jest.fn() },
      // assertServerReady (extracted, C1) re-fetches the server by id instead
      // of reading it off the serviceEnvironment include — default to the
      // same nominal server; tests exercising a specific server state (2b,
      // 2c, 2d, 3) override this explicitly alongside the serviceEnvironment
      // mutation.
      server: { findUnique: jest.fn().mockResolvedValue(baseServer()) },
      domain: { findFirst: jest.fn().mockResolvedValue(null) },
      platformConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    configResolver = {
      resolve: jest.fn().mockResolvedValue({
        branch: 'main',
        buildSource: 'DOCKERFILE_LOCAL',
        isLocalBuild: true,
        dockerImage: 'local/proj-svc:xyz',
        resolvedNixpacksConfig: null,
        resolvedStaticConfig: null,
      }),
    };
    gitProviders = {
      forService: jest.fn().mockResolvedValue(gitProvider()),
      forProject: jest.fn().mockResolvedValue(gitProvider()),
    };
    dockerConnections = {
      findForServer: jest.fn().mockResolvedValue({ circuitState: 'CLOSED' }),
    };
    crypto = { decryptSafe: jest.fn((v: string | null) => v) };
    registryAuth = { resolveAuthForImage: jest.fn().mockResolvedValue(undefined) };
    containerLifecycle = {
      assertNoForeignPortConflict: jest.fn().mockResolvedValue(''),
    };

    service = new DeploymentPreflightService(
      prisma as unknown as PrismaService,
      configResolver as unknown as DeploymentsConfigResolver,
      gitProviders as unknown as SourceProvidersService,
      dockerConnections as unknown as DockerConnectionsService,
      crypto as unknown as CryptoService,
      registryAuth as unknown as RegistryAuthService,
      containerLifecycle as unknown as ContainerLifecycleService,
    );
  });

  it('passes the nominal case (DOCKERFILE_LOCAL, everything valid)', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue(baseServiceEnv());
    await expect(
      service.assertDeployable({ serviceEnvId: 'se-1' }),
    ).resolves.toBeUndefined();
  });

  it('passes a DATABASE service with valid credentials, skipping build checks', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue(
      baseServiceEnv({
        service: {
          ...baseService(),
          type: 'DATABASE',
          databaseType: 'POSTGRES',
          databaseCredentials: { user: 'u', password: 'p', dbName: 'd' },
        },
      }),
    );
    await expect(
      service.assertDeployable({ serviceEnvId: 'se-1' }),
    ).resolves.toBeUndefined();
    expect(configResolver.resolve).not.toHaveBeenCalled();
  });

  it('1) throws NotFoundException when the service-environment does not exist', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue(null);
    await expect(
      service.assertDeployable({ serviceEnvId: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('1b) throws NotFoundException when the service-environment is archived', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue(
      baseServiceEnv({ archivedAt: new Date() }),
    );
    await expect(
      service.assertDeployable({ serviceEnvId: 'se-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('2) throws when no server is linked to the environment', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue(
      baseServiceEnv({
        environment: {
          id: 'env-1',
          name: 'production',
          secretsEnv: null,
          servers: [],
          project: { id: 'proj-1', name: 'proj' },
        },
      }),
    );
    await expect(
      service.assertDeployable({ serviceEnvId: 'se-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('2b) throws when the server is not verified', async () => {
    const env = baseServiceEnv();
    env.environment.servers[0].isVerified = false;
    prisma.serviceEnvironment.findUnique.mockResolvedValue(env);
    prisma.server.findUnique.mockResolvedValue(env.environment.servers[0]);
    await expect(
      service.assertDeployable({ serviceEnvId: 'se-1' }),
    ).rejects.toThrow(/pas vérifié/);
  });

  it('2c) throws when the server status is not deployable', async () => {
    const env = baseServiceEnv();
    env.environment.servers[0].status = 'PREPARING';
    prisma.serviceEnvironment.findUnique.mockResolvedValue(env);
    prisma.server.findUnique.mockResolvedValue(env.environment.servers[0]);
    await expect(
      service.assertDeployable({ serviceEnvId: 'se-1' }),
    ).rejects.toThrow(/statut actuel : PREPARING/);
  });

  it('2d) throws when Docker is not confirmed installed on the server', async () => {
    const env = baseServiceEnv();
    env.environment.servers[0].capabilities = {} as { 'docker.installed': string };
    prisma.serviceEnvironment.findUnique.mockResolvedValue(env);
    prisma.server.findUnique.mockResolvedValue(env.environment.servers[0]);
    await expect(
      service.assertDeployable({ serviceEnvId: 'se-1' }),
    ).rejects.toThrow(/Docker n'est pas installé/);
  });

  it('3) throws ServiceUnavailableException when the Docker circuit breaker is OPEN', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue(baseServiceEnv());
    dockerConnections.findForServer.mockResolvedValue({ circuitState: 'OPEN' });
    await expect(
      service.assertDeployable({ serviceEnvId: 'se-1' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('4) throws when buildPack is NONE and no external image is provided', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue(
      baseServiceEnv({
        service: { ...baseService(), buildPack: 'NONE', sourceType: 'GIT' },
      }),
    );
    await expect(
      service.assertDeployable({ serviceEnvId: 'se-1' }),
    ).rejects.toThrow(/type de build n'est pas configuré/);
  });

  it('5) throws when no Dockerfile is found on the branch', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue(baseServiceEnv());
    gitProviders.forService.mockResolvedValue({
      readFile: jest.fn().mockResolvedValue(null),
      resolveGitCredentials: jest.fn().mockResolvedValue({
        repoUrl: 'https://gitlab.example.com/g/r.git',
        token: 't',
      }),
    });
    await expect(
      service.assertDeployable({ serviceEnvId: 'se-1' }),
    ).rejects.toThrow(/Aucun Dockerfile trouvé/);
  });

  it('5b) throws when docker-compose content is empty', async () => {
    configResolver.resolve.mockResolvedValue({
      branch: 'main',
      buildSource: 'DOCKER_COMPOSE',
      isLocalBuild: true,
      dockerImage: 'compose://proj',
    });
    prisma.serviceEnvironment.findUnique.mockResolvedValue(
      baseServiceEnv({
        service: { ...baseService(), buildPack: 'DOCKER_COMPOSE', dockerComposeContent: '' },
      }),
    );
    await expect(
      service.assertDeployable({ serviceEnvId: 'se-1' }),
    ).rejects.toThrow(/pas de contenu docker-compose/);
  });

  it('5c) throws when docker-compose content is not valid YAML', async () => {
    configResolver.resolve.mockResolvedValue({
      branch: 'main',
      buildSource: 'DOCKER_COMPOSE',
      isLocalBuild: true,
      dockerImage: 'compose://proj',
    });
    prisma.serviceEnvironment.findUnique.mockResolvedValue(
      baseServiceEnv({
        service: {
          ...baseService(),
          buildPack: 'DOCKER_COMPOSE',
          dockerComposeContent: 'services:\n  api:\n\timage: x', // tab -> invalid YAML
        },
      }),
    );
    await expect(
      service.assertDeployable({ serviceEnvId: 'se-1' }),
    ).rejects.toThrow(/YAML valide/);
  });

  it('6) throws a distinct message when the branch does not exist on an otherwise reachable repo', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue(baseServiceEnv());
    execFileMock.mockImplementationOnce((_f, _a, _o, cb) =>
      cb(null, { stdout: 'abc123\trefs/heads/other-branch', stderr: '' }),
    );
    await expect(
      service.assertDeployable({ serviceEnvId: 'se-1', branch: 'main' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('7) throws when secretsEnv JSON is malformed at any level', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue(
      baseServiceEnv({ secretsEnv: '{not-json' }),
    );
    await expect(
      service.assertDeployable({ serviceEnvId: 'se-1' }),
    ).rejects.toThrow(/format invalide \(JSON malformé\)/);
  });

  it('8) throws when the resolved image points to a registry with incomplete credentials', async () => {
    configResolver.resolve.mockResolvedValue({
      branch: 'main',
      buildSource: 'DOCKERFILE_REGISTRY',
      isLocalBuild: false,
      dockerImage: 'registry.example.com/g/r:main',
    });
    registryAuth.resolveAuthForImage.mockRejectedValue(
      new BadRequestException(
        "La configuration du registre « custom » est incomplète.",
      ),
    );
    prisma.serviceEnvironment.findUnique.mockResolvedValue(
      baseServiceEnv({
        service: { ...baseService(), buildMode: 'REGISTRY' },
      }),
    );
    await expect(
      service.assertDeployable({ serviceEnvId: 'se-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(registryAuth.resolveAuthForImage).toHaveBeenCalledWith(
      'registry.example.com/g/r:main',
    );
  });

  it('does not check the registry for a local build (image never pulled)', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue(baseServiceEnv());
    await service.assertDeployable({ serviceEnvId: 'se-1' });
    expect(registryAuth.resolveAuthForImage).not.toHaveBeenCalled();
  });

  it('9) checks host-port availability for a plain APPLICATION service (no Traefik domain)', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue(baseServiceEnv());
    await service.assertDeployable({ serviceEnvId: 'se-1' });
    expect(containerLifecycle.assertNoForeignPortConflict).toHaveBeenCalledWith(
      'srv-1',
      expect.any(String),
      3000,
      true,
    );
  });

  it('9b) propagates the port-conflict rejection from ContainerLifecycleService', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue(baseServiceEnv());
    containerLifecycle.assertNoForeignPortConflict.mockRejectedValue(
      new BadRequestException(
        'Le port hôte 3000 est déjà utilisé sur ce serveur par le conteneur "other-app".',
      ),
    );
    await expect(
      service.assertDeployable({ serviceEnvId: 'se-1' }),
    ).rejects.toThrow(/déjà utilisé/);
  });

  it('9c) applies the blue-green port offset when strategy is blue-green', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue(baseServiceEnv());
    await service.assertDeployable({ serviceEnvId: 'se-1', strategy: 'blue-green' });
    expect(containerLifecycle.assertNoForeignPortConflict).toHaveBeenCalledWith(
      'srv-1',
      expect.any(String),
      3001,
      true,
    );
  });

  it('9d) skips the port check when a Traefik domain is already configured (no host port published)', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue(baseServiceEnv());
    prisma.domain.findFirst.mockResolvedValue({ id: 'dom-1' });
    await service.assertDeployable({ serviceEnvId: 'se-1' });
    expect(containerLifecycle.assertNoForeignPortConflict).not.toHaveBeenCalled();
  });

  it('9e) skips the port check when auto-subdomain would apply (PLATFORM_BASE_DOMAIN set)', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue(baseServiceEnv());
    prisma.platformConfig.findUnique.mockImplementation(
      ({ where: { key } }: { where: { key: string } }) =>
        key === 'PLATFORM_BASE_DOMAIN'
          ? Promise.resolve({ value: 'apps.example.com' })
          : Promise.resolve(null),
    );
    await service.assertDeployable({ serviceEnvId: 'se-1' });
    expect(containerLifecycle.assertNoForeignPortConflict).not.toHaveBeenCalled();
  });

  it('9f) skips the port check entirely for WORKER/CRON services (never publish a host port)', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue(
      baseServiceEnv({ service: { ...baseService(), type: 'WORKER' } }),
    );
    await service.assertDeployable({ serviceEnvId: 'se-1' });
    expect(containerLifecycle.assertNoForeignPortConflict).not.toHaveBeenCalled();
  });

  it('9g) checks the fixed engine port for a DATABASE service (always publishes, no Traefik)', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue(
      baseServiceEnv({
        service: {
          ...baseService(),
          type: 'DATABASE',
          databaseType: 'POSTGRES',
          databaseCredentials: { user: 'u', password: 'p', dbName: 'd' },
        },
      }),
    );
    await service.assertDeployable({ serviceEnvId: 'se-1' });
    expect(containerLifecycle.assertNoForeignPortConflict).toHaveBeenCalledWith(
      'srv-1',
      expect.any(String),
      5432,
      true,
    );
  });

  // C1 (Sprints 4+5+6 mission): assertServerReady is the reusable subset
  // used directly by DeploymentsRollbackService/ReconcilerService, called
  // here without going through assertDeployable's serviceEnvironment lookup.
  describe('assertServerReady (direct calls)', () => {
    it('resolves for a nominal, ready server', async () => {
      prisma.server.findUnique.mockResolvedValue(baseServer());
      await expect(service.assertServerReady('srv-1')).resolves.toBeUndefined();
    });

    it('throws NotFoundException when the server does not exist', async () => {
      prisma.server.findUnique.mockResolvedValue(null);
      await expect(service.assertServerReady('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws when the server is disabled', async () => {
      prisma.server.findUnique.mockResolvedValue({
        ...baseServer(),
        isActive: false,
      });
      await expect(service.assertServerReady('srv-1')).rejects.toThrow(
        /désactivé/,
      );
    });

    it('throws when the server is not verified', async () => {
      prisma.server.findUnique.mockResolvedValue({
        ...baseServer(),
        isVerified: false,
      });
      await expect(service.assertServerReady('srv-1')).rejects.toThrow(
        /pas vérifié/,
      );
    });

    it('throws ServiceUnavailableException when the Docker circuit breaker is OPEN', async () => {
      prisma.server.findUnique.mockResolvedValue(baseServer());
      dockerConnections.findForServer.mockResolvedValue({
        circuitState: 'OPEN',
      });
      await expect(
        service.assertServerReady('srv-1'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('does NOT perform any of the full preflight checks (no Dockerfile/secrets/registry/port checks)', async () => {
      prisma.server.findUnique.mockResolvedValue(baseServer());
      await service.assertServerReady('srv-1');
      expect(gitProviders.forService).not.toHaveBeenCalled();
      expect(registryAuth.resolveAuthForImage).not.toHaveBeenCalled();
      expect(containerLifecycle.assertNoForeignPortConflict).not.toHaveBeenCalled();
    });
  });
});
