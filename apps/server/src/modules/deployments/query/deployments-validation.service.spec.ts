import { BadRequestException } from '@nestjs/common';

// Mock the repo-clone preflight's outbound calls (git + temp askpass file).
const execFileMock = jest.fn(
  (
    _file: string,
    _args: string[],
    _opts: unknown,
    cb: (e: Error | null, r: { stdout: string; stderr: string }) => void,
  ) => cb(null, { stdout: 'refs/heads/main', stderr: '' }),
);
jest.mock('child_process', () => ({ execFile: execFileMock }));
jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));
// deployment-preflight.service.ts is now imported transitively (for its
// type/DI token) — its top-level enum usage needs these on the mocked client
// even though the preflight itself is stubbed below, never constructed here.
jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Role: { ADMIN: 'ADMIN', DEVELOPER: 'DEVELOPER' },
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
jest.mock('../../../shared/database/prisma.service', () => ({
  PrismaService: class {},
}));

import { PrismaService } from '../../../shared/database/prisma.service';
import { SshExecutorService } from '../../../adapters/ssh/ssh-executor.service';
import { DeploymentsAuthorizationService } from './deployments-authorization.service';
import { SourceProvidersService } from '../../source-providers/source-providers.service';
import { DeploymentPreflightService } from '../core/deployment-preflight.service';
import { DeploymentsValidationService } from './deployments-validation.service';

describe('DeploymentsValidationService.validate', () => {
  let prisma: {
    serviceEnvironment: { findUnique: jest.Mock };
    environment: { findFirst: jest.Mock };
    server: { findUnique: jest.Mock };
    serverRun: { findFirst: jest.Mock };
  };
  let auth: { getActor: jest.Mock; assertCanDeployProject: jest.Mock };
  let providers: { forProject: jest.Mock; forService: jest.Mock };
  let preflight: { assertDeployable: jest.Mock };
  let service: DeploymentsValidationService;

  beforeEach(() => {
    execFileMock.mockClear();
    prisma = {
      serviceEnvironment: { findUnique: jest.fn().mockResolvedValue(null) },
      environment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'env-1',
          servers: [{ id: 'srv-1', name: 'srv', host: '10.0.0.1' }],
        }),
      },
      server: {
        findUnique: jest.fn().mockResolvedValue({
          installedTools: [
            { toolKey: 'docker', status: 'INSTALLED' },
            { toolKey: 'nixpacks', status: 'INSTALLED' },
          ],
        }),
      },
      serverRun: {
        findFirst: jest.fn().mockResolvedValue({ id: 'run-1' }),
      },
    };
    auth = {
      getActor: jest.fn().mockResolvedValue({ id: 'u1', role: 'ADMIN' }),
      assertCanDeployProject: jest.fn().mockResolvedValue(undefined),
    };
    providers = {
      forProject: jest.fn().mockResolvedValue({
        resolveGitCredentials: jest.fn().mockResolvedValue({
          repoUrl: 'https://gitlab.example.com/g/r.git',
          token: 't',
        }),
      }),
      forService: jest.fn(),
    };
    preflight = {
      assertDeployable: jest.fn().mockResolvedValue(undefined),
    };
    service = new DeploymentsValidationService(
      prisma as unknown as PrismaService,
      auth as unknown as DeploymentsAuthorizationService,
      {} as never,
      {} as never,
      {} as unknown as SshExecutorService,
      providers as unknown as SourceProvidersService,
      preflight as unknown as DeploymentPreflightService,
    );
  });

  it('enforces deploy authorization before anything else', async () => {
    auth.assertCanDeployProject.mockRejectedValue(new Error('forbidden'));
    await expect(
      service.validate('p1', 'env-1', 'EXTERNAL_IMAGE', 'u1'),
    ).rejects.toThrow('forbidden');
  });

  // databaseType/databaseCredentials validation used to be duplicated inline
  // here; it now lives solely in DeploymentPreflightService.assertDeployable
  // (see deployment-preflight.service.spec.ts for the exhaustive cases) —
  // this service only reports whatever the preflight decides. These 3 tests
  // now verify the DELEGATION (validate() reflects assertDeployable's
  // outcome for a DATABASE service), not the field-validation rules
  // themselves anymore.
  it('reflects a DATABASE service rejection from the preflight (e.g. missing databaseType)', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue({
      service: { type: 'DATABASE' },
    });
    preflight.assertDeployable.mockRejectedValue(
      new BadRequestException('databaseType est requis pour un service DATABASE'),
    );
    await expect(
      service.validate('p1', 'env-1', 'EXTERNAL_IMAGE', 'u1', 'se-1'),
    ).resolves.toMatchObject({ ready: false, reason: expect.stringContaining('databaseType') });
  });

  it('reflects a DATABASE service rejection from the preflight (e.g. incomplete credentials)', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue({
      service: { type: 'DATABASE' },
    });
    preflight.assertDeployable.mockRejectedValue(
      new BadRequestException('databaseCredentials doit contenir user, password et dbName'),
    );
    const res = await service.validate('p1', 'env-1', 'EXTERNAL_IMAGE', 'u1', 'se-1');
    expect(res.ready).toBe(false);
    expect(res.reason).toContain('databaseCredentials');
  });

  it('accepts a valid DATABASE service (ready, EXTERNAL_IMAGE) and delegates to the preflight', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue({
      service: { type: 'DATABASE' },
    });
    const res = await service.validate(
      'p1',
      'env-1',
      'EXTERNAL_IMAGE',
      'u1',
      'se-1',
    );
    expect(res.ready).toBe(true);
    expect(res.buildSource).toBe('EXTERNAL_IMAGE');
    expect(preflight.assertDeployable).toHaveBeenCalledWith({
      serviceEnvId: 'se-1',
    });
  });

  it('throws when the environment is not found', async () => {
    prisma.environment.findFirst.mockResolvedValue(null);
    await expect(
      service.validate('p1', 'env-x', 'EXTERNAL_IMAGE', 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns required tools for a registry source without cloning the repo', async () => {
    const res = await service.validate(
      'p1',
      'env-1',
      'DOCKERFILE_REGISTRY',
      'u1',
    );
    expect(res.ready).toBe(true);
    expect(res.required.map((r) => r.binary)).toContain('docker');
    expect(execFileMock).not.toHaveBeenCalled(); // registry source skips git preflight
  });

  it('runs the git preflight for local sources and passes when reachable', async () => {
    const res = await service.validate('p1', 'env-1', 'DOCKERFILE_LOCAL', 'u1');
    expect(res.ready).toBe(true);
    expect(execFileMock).toHaveBeenCalled(); // local source clones-check the repo
  });

  it('fails a local source when the repo is unreachable', async () => {
    execFileMock.mockImplementationOnce((_f, _a, _o, cb) =>
      cb(null, { stdout: '', stderr: 'fatal: Authentication failed' }),
    );
    await expect(
      service.validate('p1', 'env-1', 'DOCKERFILE_LOCAL', 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns ready:false when the server has no successful preparation run', async () => {
    prisma.serverRun.findFirst.mockResolvedValue(null);
    const res = await service.validate(
      'p1',
      'env-1',
      'DOCKERFILE_REGISTRY',
      'u1',
    );
    expect(res.ready).toBe(false);
    expect(res.missing.map((m) => m.binary)).toContain('docker');
  });

  it('runs the preflight for a non-DATABASE service too when serviceEnvId is given, and passes it through', async () => {
    const res = await service.validate(
      'p1',
      'env-1',
      'DOCKERFILE_REGISTRY',
      'u1',
      'se-1',
    );
    expect(preflight.assertDeployable).toHaveBeenCalledWith({
      serviceEnvId: 'se-1',
    });
    expect(res.ready).toBe(true);
  });

  it('reports ready:false with the preflight reason even when all tools are installed', async () => {
    preflight.assertDeployable.mockRejectedValue(
      new BadRequestException("Aucun Dockerfile trouvé sur la branche « main »"),
    );
    const res = await service.validate(
      'p1',
      'env-1',
      'DOCKERFILE_REGISTRY',
      'u1',
      'se-1',
    );
    expect(res.ready).toBe(false);
    expect(res.reason).toContain('Dockerfile');
    // Tool detection is independent info and still runs/reports correctly.
    expect(res.required.map((r) => r.binary)).toContain('docker');
  });

  it('does not run the legacy repo-cloneable fallback when serviceEnvId is given (assertDeployable already covers it)', async () => {
    await service.validate('p1', 'env-1', 'DOCKERFILE_LOCAL', 'u1', 'se-1');
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('returns ready:false when a required tool is not installed', async () => {
    prisma.server.findUnique.mockResolvedValue({ installedTools: [] });
    const res = await service.validate('p1', 'env-1', 'NIXPACKS_LOCAL', 'u1');
    expect(res.ready).toBe(false);
    expect(res.missing.length).toBeGreaterThan(0);
  });
});
